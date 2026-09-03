import { findDuplicateCandidates, materialiseSourceRecord, createSourceRecord } from "./source-library";
import { read } from "./store";
import {
  collectMetObjects,
  getMetProfile,
  metObjectToSourceInput,
  scheduledMetProfile,
  type MetFetchOptions,
} from "./source-adapters/met";

export type IngestionTrigger = "manual" | "scheduled";
export type MetIngestionResult = {
  adapter: "met-open-access";
  profileId: string;
  query: string;
  trigger: IngestionTrigger;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  idsConsidered: number;
  fetched: number;
  eligible: number;
  created: number;
  duplicates: number;
  skipped: number;
  errors: string[];
};

export async function runMetIngestion(input: {
  profileId: string;
  actorId: string;
  trigger: IngestionTrigger;
  limit?: number;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: MetFetchOptions["sleep"];
  interRequestMs?: number;
}): Promise<MetIngestionResult> {
  const startedAt = new Date().toISOString();
  const profile = getMetProfile(input.profileId);
  const collected = await collectMetObjects(profile, {
    limit: input.limit,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    interRequestMs: input.interRequestMs,
  });

  let created = 0;
  let duplicates = 0;
  let skipped = 0;
  const errors = [...collected.errors];

  for (const object of collected.objects) {
    const sourceInput = metObjectToSourceInput(object, profile);
    if (!sourceInput) {
      skipped += 1;
      continue;
    }
    try {
      if (input.dryRun) {
        const candidate = materialiseSourceRecord(sourceInput, input.actorId);
        const matches = await read((db) => findDuplicateCandidates(candidate, db.sourceRecords));
        if (matches.some((match) => match.score >= 0.98)) duplicates += 1;
        else created += 1;
      } else {
        const result = await createSourceRecord(sourceInput, input.actorId);
        if (result.created) created += 1;
        else duplicates += 1;
      }
    } catch (error) {
      errors.push(`${sourceInput.sourceRecord ?? sourceInput.title}: ${error instanceof Error ? error.message : "import failed"}`);
    }
  }

  return {
    adapter: "met-open-access",
    profileId: profile.id,
    query: profile.query,
    trigger: input.trigger,
    dryRun: Boolean(input.dryRun),
    startedAt,
    completedAt: new Date().toISOString(),
    idsConsidered: collected.idsConsidered,
    fetched: collected.fetched,
    eligible: collected.objects.length,
    created,
    duplicates,
    skipped,
    errors: errors.slice(0, 20),
  };
}

export function scheduledIngestionGate(env: NodeJS.ProcessEnv = process.env): { enabled: boolean; reason: string } {
  if (env.MINTEDUP_ENABLE_SCHEDULED_INGESTION !== "1") {
    return { enabled: false, reason: "scheduled ingestion is not enabled" };
  }
  if (env.MINTEDUP_CRON_PRIMARY !== "1") {
    return { enabled: false, reason: "this deployment is not the designated primary cron project" };
  }
  if (env.MINTEDUP_DURABLE_STORE !== "1") {
    return { enabled: false, reason: "durable shared storage is not enabled" };
  }
  return { enabled: true, reason: "ready" };
}

export function nextScheduledMetProfile(now = new Date()) {
  return scheduledMetProfile(now);
}
