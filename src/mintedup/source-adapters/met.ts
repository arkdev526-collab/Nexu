import type { SourceRecordInput } from "../source-library";

export const MET_API_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";
export const MET_SOURCE_NAME = "The Metropolitan Museum of Art";

export type MetProfile = {
  id: string;
  label: string;
  query: string;
  categoryId: string;
  requiredAny: string[];
  maxPerRun: number;
};

/**
 * Profiles are deliberately editorially narrow. The adapter never guesses a
 * Minted Up category from arbitrary museum metadata; each scheduled query is
 * mapped to a curator-chosen category and imported as draft evidence.
 */
export const MET_PROFILES: MetProfile[] = [
  {
    id: "qing-porcelain",
    label: "Qing dynasty porcelain",
    query: "Qing dynasty porcelain",
    categoryId: "ceramics-porcelain",
    requiredAny: ["porcelain", "qing", "kangxi", "yongzheng", "qianlong"],
    maxPerRun: 12,
  },
  {
    id: "chinese-cloisonne",
    label: "Chinese cloisonné & enamel metalwork",
    query: "Chinese cloisonne enamel",
    categoryId: "metalware",
    requiredAny: ["cloisonne", "cloisonné", "enamel"],
    maxPerRun: 8,
  },
  {
    id: "georgian-furniture",
    label: "Georgian furniture",
    query: "Georgian furniture",
    categoryId: "furniture-georgian",
    requiredAny: ["furniture", "mahogany", "table", "chair", "desk", "cabinet", "chest"],
    maxPerRun: 8,
  },
  {
    id: "historic-glass",
    label: "Historic glass vessels",
    query: "glass vase bottle goblet",
    categoryId: "glass-antique",
    requiredAny: ["glass", "vase", "bottle", "goblet", "decanter"],
    maxPerRun: 10,
  },
];

export type MetSearchResponse = { total?: number; objectIDs?: number[] | null };
export type MetTag = { term?: string | null };
export type MetObject = {
  objectID: number;
  isPublicDomain?: boolean;
  accessionNumber?: string;
  accessionYear?: string;
  department?: string;
  objectName?: string;
  title?: string;
  culture?: string;
  period?: string;
  dynasty?: string;
  reign?: string;
  artistDisplayName?: string;
  artistRole?: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  classification?: string;
  country?: string;
  region?: string;
  objectURL?: string;
  tags?: MetTag[] | null;
};

export type MetFetchOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

export class MetAdapterError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "MetAdapterError";
  }
}

function text(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalised(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(15_000, seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(15_000, Math.max(0, date - Date.now()));
  }
  return Math.min(8_000, 500 * 2 ** attempt);
}

async function fetchJson<T>(url: string, options: MetFetchOptions = {}): Promise<T | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    } catch (error) {
      if (attempt + 1 >= attempts) {
        throw new MetAdapterError(`The Met API request failed: ${error instanceof Error ? error.message : "network error"}`);
      }
      await sleep(Math.min(8_000, 500 * 2 ** attempt));
      continue;
    }

    if (response.status === 404) return null;
    if (response.ok) return (await response.json()) as T;

    const retryable = response.status === 403 || response.status === 429 || response.status >= 500;
    if (!retryable || attempt + 1 >= attempts) {
      throw new MetAdapterError(`The Met API returned HTTP ${response.status}.`, response.status);
    }
    await sleep(retryDelay(response, attempt));
  }
  return null;
}

export function getMetProfile(id: string): MetProfile {
  return MET_PROFILES.find((profile) => profile.id === id) ?? MET_PROFILES[0];
}

export function scheduledMetProfile(date = new Date()): MetProfile {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
  return MET_PROFILES[Math.abs(day) % MET_PROFILES.length];
}

export async function searchMetObjectIds(query: string, options: MetFetchOptions = {}): Promise<number[]> {
  const url = `${MET_API_BASE}/search?q=${encodeURIComponent(query)}`;
  const result = await fetchJson<MetSearchResponse>(url, options);
  return Array.isArray(result?.objectIDs)
    ? result.objectIDs.filter((id): id is number => Number.isInteger(id) && id > 0)
    : [];
}

export async function fetchMetObject(objectId: number, options: MetFetchOptions = {}): Promise<MetObject | null> {
  if (!Number.isInteger(objectId) || objectId <= 0) return null;
  return fetchJson<MetObject>(`${MET_API_BASE}/objects/${objectId}`, options);
}

function factualHaystack(object: MetObject): string {
  return normalised([
    object.title,
    object.objectName,
    object.medium,
    object.classification,
    object.culture,
    object.period,
    object.dynasty,
    object.reign,
    object.objectDate,
    object.country,
    object.region,
    ...(object.tags ?? []).map((tag) => tag.term),
  ].filter(Boolean).join(" "));
}

function pushTerm(terms: string[], type: string, value: unknown): void {
  const cleaned = text(value, 220);
  if (cleaned) terms.push(`${type}:${cleaned}`);
}

export function metObjectToSourceInput(object: MetObject, profile: MetProfile): SourceRecordInput | null {
  if (object.isPublicDomain !== true) return null;
  const sourceUrl = text(object.objectURL, 1000);
  const title = text(object.title, 300);
  if (!sourceUrl.startsWith("https://www.metmuseum.org/") || !title) return null;

  const haystack = factualHaystack(object);
  if (profile.requiredAny.length > 0 && !profile.requiredAny.some((term) => haystack.includes(normalised(term)))) {
    return null;
  }

  const terms: string[] = [];
  pushTerm(terms, "form", object.objectName || object.classification);
  pushTerm(terms, "material", object.medium);
  pushTerm(terms, "period", object.objectDate);
  pushTerm(terms, "period", object.dynasty);
  pushTerm(terms, "period", object.reign);
  pushTerm(terms, "origin", object.culture);
  pushTerm(terms, "origin", object.country || object.region);
  const maker = text(object.artistDisplayName, 220);
  if (maker && !/^(unknown|unidentified|anonymous)$/i.test(maker)) pushTerm(terms, "maker", maker);
  for (const tag of (object.tags ?? []).slice(0, 8)) pushTerm(terms, "keyword", tag.term);

  const facts = [
    `The Met records this object as “${title}”.`,
    object.objectName && `Object type: ${text(object.objectName)}.`,
    object.objectDate && `Date: ${text(object.objectDate)}.`,
    object.dynasty && `Dynasty: ${text(object.dynasty)}.`,
    object.reign && `Reign: ${text(object.reign)}.`,
    object.culture && `Culture: ${text(object.culture)}.`,
    object.medium && `Medium: ${text(object.medium, 700)}.`,
    object.classification && `Classification: ${text(object.classification)}.`,
    object.department && `Department: ${text(object.department)}.`,
    object.accessionNumber && `Accession number: ${text(object.accessionNumber)}.`,
  ].filter(Boolean).join(" ");

  const sourceRecord = text(object.accessionNumber, 180) || `Object ${object.objectID}`;
  return {
    kind: "museum-object",
    sourceType: "museum",
    sourceName: MET_SOURCE_NAME,
    sourceUrl,
    sourceRecord,
    categoryId: profile.categoryId,
    title,
    description: facts,
    terms,
    dimensions: text(object.dimensions, 600),
    condition: "",
    provenance: "",
    currency: null,
    realisedPrice: null,
    askingPrice: null,
    auction: null,
    snapshotTitle: `${MET_SOURCE_NAME} · ${sourceRecord}`,
    snapshotExcerpt: facts.slice(0, 1800),
  };
}

export type MetCollectionResult = {
  query: string;
  idsConsidered: number;
  fetched: number;
  objects: MetObject[];
  errors: string[];
};

export async function collectMetObjects(
  profile: MetProfile,
  options: MetFetchOptions & { limit?: number; interRequestMs?: number } = {},
): Promise<MetCollectionResult> {
  const limit = Math.max(1, Math.min(25, options.limit ?? profile.maxPerRun));
  const ids = await searchMetObjectIds(profile.query, options);
  const candidates = ids.slice(0, Math.min(ids.length, limit * 4));
  const objects: MetObject[] = [];
  const errors: string[] = [];
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const interRequestMs = Math.max(0, Math.min(2_000, options.interRequestMs ?? 450));
  let fetched = 0;

  for (const objectId of candidates) {
    if (objects.length >= limit) break;
    if (fetched > 0 && interRequestMs > 0) await sleep(interRequestMs);
    try {
      const object = await fetchMetObject(objectId, options);
      fetched += 1;
      if (object && metObjectToSourceInput(object, profile)) objects.push(object);
    } catch (error) {
      fetched += 1;
      errors.push(`Object ${objectId}: ${error instanceof Error ? error.message : "fetch failed"}`);
      if (errors.length >= 10) break;
    }
  }

  return { query: profile.query, idsConsidered: candidates.length, fetched, objects, errors };
}
