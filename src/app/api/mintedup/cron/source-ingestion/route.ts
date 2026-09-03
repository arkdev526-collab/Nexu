import { fail, ok } from "@/mintedup/http";
import { nextScheduledMetProfile, runMetIngestion, scheduledIngestionGate } from "@/mintedup/ingestion";
import { ensureSeeded } from "@/mintedup/seed";
import { ensureVerifiedSourceSeeds } from "@/mintedup/source-seeds";
import { SecurityError } from "@/mintedup/security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function assertCronSecret(request: Request): void {
  const secret = process.env.MINTEDUP_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) throw new SecurityError("Cron secret is not configured.", 503);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new SecurityError("Invalid cron authorization.", 401);
  }
}

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const gate = scheduledIngestionGate();
    if (!gate.enabled) return ok({ skipped: true, reason: gate.reason });

    await ensureSeeded();
    await ensureVerifiedSourceSeeds();
    const profile = nextScheduledMetProfile();
    const configured = Number(process.env.MINTEDUP_MET_SCHEDULE_LIMIT ?? profile.maxPerRun);
    const limit = Number.isFinite(configured)
      ? Math.max(1, Math.min(12, Math.round(configured)))
      : profile.maxPerRun;
    const result = await runMetIngestion({
      profileId: profile.id,
      actorId: "system:met-open-access",
      trigger: "scheduled",
      limit,
    });
    return ok({ skipped: false, result });
  } catch (error) {
    return fail(error);
  }
}
