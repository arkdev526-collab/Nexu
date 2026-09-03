import { createHash } from "node:crypto";
import { isValidCategory } from "./categories";
import { mutate, newId, read } from "./store";
import type {
  ResearchDoc,
  ResearchSourceType,
  SourceAuctionEvidence,
  SourceRecord,
  SourceRecordKind,
  SourceReviewStatus,
  SourceSnapshot,
} from "./types";

type Currency = "GBP" | "USD" | "EUR";

const SOURCE_TYPES = new Set<ResearchSourceType>([
  "museum",
  "institution",
  "auction-house",
  "dealer",
  "marketplace",
  "seller",
  "mintedup-reference",
  "mintedup-demo",
]);
const SOURCE_KINDS = new Set<SourceRecordKind>([
  "museum-object",
  "institutional-catalogue",
  "auction-lot",
  "dealer-listing",
  "marketplace-sale",
]);
const CURRENCIES = new Set<Currency>(["GBP", "USD", "EUR"]);

export class SourceLibraryError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "SourceLibraryError";
  }
}

export type SourceRecordInput = {
  kind: SourceRecordKind;
  sourceType: ResearchSourceType;
  sourceName: string;
  sourceUrl: string;
  sourceRecord?: string | null;
  categoryId: string;
  title: string;
  description: string;
  terms?: string[];
  condition?: string;
  provenance?: string;
  dimensions?: string;
  currency?: Currency | null;
  realisedPrice?: number | null;
  askingPrice?: number | null;
  auction?: Partial<SourceAuctionEvidence> | null;
  snapshotTitle?: string;
  snapshotExcerpt?: string;
  observedAt?: string | null;
};

export type DuplicateCandidate = {
  id: string;
  title: string;
  score: number;
  reasons: string[];
  verified: boolean;
};

function clean(value: unknown, max = 4000): string {
  return String(value ?? "").trim().slice(0, max);
}

function positiveMinor(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function nonNegative(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function safeDate(value: unknown): string | null {
  const raw = clean(value, 80);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function jaccard(a: string, b: string): number {
  const left = new Set(normaliseText(a).split(" ").filter((term) => term.length > 1));
  const right = new Set(normaliseText(b).split(" ").filter((term) => term.length > 1));
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((term) => right.has(term)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

export function normaliseAuctionEvidence(input: Partial<SourceAuctionEvidence> | null | undefined): SourceAuctionEvidence | null {
  if (!input) return null;
  const hammerPrice = positiveMinor(input.hammerPrice);
  let buyerPremiumAmount = nonNegative(input.buyerPremiumAmount);
  const buyerPremiumRateBps = nonNegative(input.buyerPremiumRateBps);
  let buyerTotalPrice = positiveMinor(input.buyerTotalPrice);

  if (hammerPrice && buyerPremiumAmount === null && buyerPremiumRateBps !== null) {
    buyerPremiumAmount = Math.round((hammerPrice * buyerPremiumRateBps) / 10_000);
  }
  if (hammerPrice && buyerPremiumAmount !== null && buyerTotalPrice === null) {
    buyerTotalPrice = hammerPrice + buyerPremiumAmount;
  }
  if (hammerPrice && buyerTotalPrice && buyerPremiumAmount === null) {
    if (buyerTotalPrice < hammerPrice) {
      throw new SourceLibraryError("Buyer total cannot be below the hammer price.");
    }
    buyerPremiumAmount = buyerTotalPrice - hammerPrice;
  }
  if (hammerPrice && buyerTotalPrice && buyerPremiumAmount !== null) {
    if (Math.abs(buyerTotalPrice - (hammerPrice + buyerPremiumAmount)) > 1) {
      throw new SourceLibraryError("Hammer, premium and buyer-total figures do not reconcile.");
    }
  }

  const currency = input.currency && CURRENCIES.has(input.currency) ? input.currency : null;
  return {
    saleName: clean(input.saleName, 180),
    saleDate: safeDate(input.saleDate),
    lotNumber: clean(input.lotNumber, 80) || null,
    estimateLow: positiveMinor(input.estimateLow),
    estimateHigh: positiveMinor(input.estimateHigh),
    hammerPrice,
    buyerPremiumAmount,
    buyerPremiumRateBps,
    buyerTotalPrice,
    currency,
    sold: input.sold === true ? true : input.sold === false ? false : null,
    priceNote: clean(input.priceNote, 500),
  };
}

export function buildSourceSnapshot(input: {
  url: string;
  title: string;
  excerpt: string;
  capturedAt?: string | null;
}): SourceSnapshot | null {
  const excerpt = clean(input.excerpt, 2000);
  const title = clean(input.title, 240);
  const url = canonicalUrl(input.url);
  if (!excerpt && !title) return null;
  const capturedAt = safeDate(input.capturedAt) ?? new Date().toISOString();
  const payload = JSON.stringify({ url, title, excerpt, capturedAt });
  return {
    capturedAt,
    url,
    title,
    excerpt,
    contentHash: createHash("sha256").update(payload).digest("hex"),
  };
}

export function sourceFingerprint(input: Pick<SourceRecord, "kind" | "sourceType" | "sourceName" | "sourceUrl" | "sourceRecord" | "title" | "categoryId" | "dimensions" | "auction">): string {
  const sourceName = normaliseText(input.sourceName);
  const sourceRecord = normaliseText(input.sourceRecord ?? "");
  const url = canonicalUrl(input.sourceUrl).toLowerCase();
  const lot = normaliseText(input.auction?.lotNumber ?? "");
  const saleDate = input.auction?.saleDate ?? "";
  const stable = sourceRecord
    ? `record|${input.sourceType}|${sourceName}|${sourceRecord}`
    : lot && saleDate
      ? `lot|${input.sourceType}|${sourceName}|${saleDate}|${lot}`
      : url
        ? `url|${input.sourceType}|${url}`
        : `object|${input.kind}|${input.categoryId}|${normaliseText(input.title)}|${normaliseText(input.dimensions)}`;
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export function findDuplicateCandidates(candidate: SourceRecord, records: SourceRecord[]): DuplicateCandidate[] {
  return records
    .filter((record) => record.id !== candidate.id)
    .map((record) => {
      const reasons: string[] = [];
      let score = 0;
      if (record.fingerprint === candidate.fingerprint) {
        score = 1;
        reasons.push("same canonical source fingerprint");
      }
      if (
        candidate.sourceRecord &&
        record.sourceRecord &&
        normaliseText(candidate.sourceName) === normaliseText(record.sourceName) &&
        normaliseText(candidate.sourceRecord) === normaliseText(record.sourceRecord)
      ) {
        score = Math.max(score, 1);
        reasons.push("same source record / object / lot identifier");
      }
      const leftUrl = canonicalUrl(candidate.sourceUrl);
      const rightUrl = canonicalUrl(record.sourceUrl);
      if (leftUrl && rightUrl && leftUrl === rightUrl) {
        score = Math.max(score, 0.98);
        reasons.push("same source URL");
      }
      if (
        candidate.auction?.lotNumber &&
        record.auction?.lotNumber &&
        normaliseText(candidate.sourceName) === normaliseText(record.sourceName) &&
        normaliseText(candidate.auction.lotNumber) === normaliseText(record.auction.lotNumber) &&
        candidate.auction.saleDate === record.auction.saleDate
      ) {
        score = Math.max(score, 0.97);
        reasons.push("same auction house, sale date and lot number");
      }
      if (candidate.categoryId === record.categoryId) {
        const titleSimilarity = jaccard(candidate.title, record.title);
        if (titleSimilarity >= 0.7) {
          score = Math.max(score, 0.58 + titleSimilarity * 0.32);
          reasons.push(`similar title (${Math.round(titleSimilarity * 100)}%)`);
        }
        if (candidate.dimensions && record.dimensions && normaliseText(candidate.dimensions) === normaliseText(record.dimensions)) {
          score = Math.min(0.96, score + 0.08);
          reasons.push("same recorded dimensions");
        }
      }
      return {
        id: record.id,
        title: record.title,
        score: Number(score.toFixed(2)),
        reasons,
        verified: record.reviewStatus === "verified",
      };
    })
    .filter((candidate) => candidate.score >= 0.72)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function materialiseSourceRecord(
  input: SourceRecordInput,
  actorId: string,
  options: { id?: string; reviewStatus?: SourceReviewStatus; now?: string } = {},
): SourceRecord {
  if (!SOURCE_KINDS.has(input.kind)) throw new SourceLibraryError("Unsupported source record kind.");
  if (!SOURCE_TYPES.has(input.sourceType)) throw new SourceLibraryError("Unsupported source type.");
  if (!isValidCategory(input.categoryId)) throw new SourceLibraryError("Choose a valid Minted Up category.");

  const sourceName = clean(input.sourceName, 180);
  const sourceUrl = canonicalUrl(clean(input.sourceUrl, 1000));
  const title = clean(input.title, 300);
  const description = clean(input.description, 5000);
  if (!sourceName || !sourceUrl || !title || !description) {
    throw new SourceLibraryError("Source name, official URL, title and evidence description are required.");
  }

  const now = options.now ?? new Date().toISOString();
  const auction = normaliseAuctionEvidence(input.auction);
  const currency = input.currency && CURRENCIES.has(input.currency) ? input.currency : auction?.currency ?? null;
  let realisedPrice = positiveMinor(input.realisedPrice);
  const askingPrice = positiveMinor(input.askingPrice);

  // Auction intelligence rule: an auction record enters 'what the buyer paid'
  // guidance only when a premium-inclusive buyer total is known. Hammer-only
  // results remain evidence but are deliberately not mixed with buyer totals.
  if (input.kind === "auction-lot") {
    realisedPrice = auction?.sold && auction.buyerTotalPrice ? auction.buyerTotalPrice : null;
  }

  const record: SourceRecord = {
    id: options.id ?? newId("src"),
    kind: input.kind,
    reviewStatus: options.reviewStatus ?? "draft",
    sourceType: input.sourceType,
    sourceName,
    sourceUrl,
    sourceRecord: clean(input.sourceRecord, 180) || null,
    categoryId: input.categoryId,
    title,
    description,
    terms: [...new Set((input.terms ?? []).map((term) => clean(term, 160)).filter(Boolean))].slice(0, 80),
    condition: clean(input.condition, 2000),
    provenance: clean(input.provenance, 2000),
    dimensions: clean(input.dimensions, 600),
    currency,
    realisedPrice,
    askingPrice,
    auction,
    snapshot: buildSourceSnapshot({
      url: sourceUrl,
      title: input.snapshotTitle || title,
      excerpt: input.snapshotExcerpt || "",
      capturedAt: input.observedAt ?? now,
    }),
    fingerprint: "",
    duplicateOf: null,
    importedBy: actorId,
    reviewedBy: options.reviewStatus === "verified" ? actorId : null,
    reviewedAt: options.reviewStatus === "verified" ? now : null,
    researchDocId: null,
    createdAt: now,
    updatedAt: now,
  };
  record.fingerprint = sourceFingerprint(record);
  return record;
}

function tierFor(record: SourceRecord): ResearchDoc["tier"] {
  if (record.sourceType === "museum" || record.sourceType === "institution") return "reference";
  if (record.kind === "auction-lot" || record.kind === "marketplace-sale" || record.kind === "dealer-listing") return "market";
  return "community";
}

function researchWeight(record: SourceRecord): number {
  if (record.sourceType === "museum") return 3.5;
  if (record.sourceType === "institution") return 3.2;
  if (record.sourceType === "auction-house") return 2.8;
  if (record.sourceType === "marketplace") return 2.3;
  if (record.sourceType === "dealer") return 1.1;
  return 0.5;
}

export function sourceRecordToResearchDoc(record: SourceRecord, existingId?: string): ResearchDoc {
  if (record.reviewStatus !== "verified") {
    throw new SourceLibraryError("Only verified source records can enter the research corpus.", 409);
  }
  const body = [
    record.description,
    record.condition && `Condition: ${record.condition}`,
    record.provenance && `Provenance: ${record.provenance}`,
    record.auction?.saleName && `Sale: ${record.auction.saleName}`,
    record.auction?.lotNumber && `Lot: ${record.auction.lotNumber}`,
    record.auction?.priceNote && `Price note: ${record.auction.priceNote}`,
  ].filter(Boolean).join(" ").slice(0, 7000);
  const terms = [...record.terms];
  if (record.dimensions && !terms.some((term) => term.startsWith("dimension:"))) terms.push(`dimension:${record.dimensions}`);

  return {
    id: existingId ?? newId("doc"),
    tier: tierFor(record),
    title: record.title,
    body,
    categoryId: record.categoryId,
    terms,
    realisedPrice: record.realisedPrice,
    currency: record.currency,
    sourceListingId: null,
    contributedBy: null,
    weight: researchWeight(record),
    createdAt: record.createdAt,
    sourceType: record.sourceType,
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl,
    sourceRecord: record.sourceRecord,
    sourceVerified: true,
    observedAt: record.snapshot?.capturedAt ?? record.updatedAt,
    priceBasis: record.askingPrice ? "asking" : record.realisedPrice ? "realised" : null,
    askingPrice: record.askingPrice,
    sourceRecordId: record.id,
    sourceSnapshotHash: record.snapshot?.contentHash ?? null,
    saleName: record.auction?.saleName || null,
    saleDate: record.auction?.saleDate ?? null,
    lotNumber: record.auction?.lotNumber ?? null,
    estimateLow: record.auction?.estimateLow ?? null,
    estimateHigh: record.auction?.estimateHigh ?? null,
    hammerPrice: record.auction?.hammerPrice ?? null,
    buyerPremiumAmount: record.auction?.buyerPremiumAmount ?? null,
    buyerPremiumRateBps: record.auction?.buyerPremiumRateBps ?? null,
    buyerTotalPrice: record.auction?.buyerTotalPrice ?? null,
    realisedPriceBasis: record.kind === "auction-lot"
      ? record.realisedPrice ? "buyer-total" : null
      : record.kind === "marketplace-sale" && record.realisedPrice
        ? "marketplace-total"
        : null,
  };
}

export async function createSourceRecord(input: SourceRecordInput, actorId: string): Promise<{
  record: SourceRecord;
  duplicates: DuplicateCandidate[];
  created: boolean;
}> {
  const candidate = materialiseSourceRecord(input, actorId);
  return mutate((db) => {
    const existing = db.sourceRecords.find((record) => record.fingerprint === candidate.fingerprint);
    if (existing) {
      return { record: existing, duplicates: findDuplicateCandidates(existing, db.sourceRecords), created: false };
    }
    const duplicates = findDuplicateCandidates(candidate, db.sourceRecords);
    candidate.duplicateOf = duplicates[0]?.score === 1 ? duplicates[0].id : null;
    db.sourceRecords.push(candidate);
    return { record: candidate, duplicates, created: true };
  });
}

export async function reviewSourceRecord(
  id: string,
  decision: "verify" | "reject",
  actorId: string,
): Promise<SourceRecord> {
  return mutate((db) => {
    const record = db.sourceRecords.find((candidate) => candidate.id === id);
    if (!record) throw new SourceLibraryError("Source record not found.", 404);
    const now = new Date().toISOString();

    if (decision === "verify") {
      const exact = db.sourceRecords.find((candidate) =>
        candidate.id !== record.id &&
        candidate.reviewStatus === "verified" &&
        candidate.fingerprint === record.fingerprint,
      );
      if (exact) throw new SourceLibraryError(`This source is already verified as ${exact.id}.`, 409);
      record.reviewStatus = "verified";
      record.duplicateOf = null;
      record.reviewedBy = actorId;
      record.reviewedAt = now;
      record.updatedAt = now;
      const existing = db.researchDocs.find((doc) => doc.sourceRecordId === record.id || doc.id === record.researchDocId);
      const doc = sourceRecordToResearchDoc(record, existing?.id);
      if (existing) Object.assign(existing, doc);
      else db.researchDocs.push(doc);
      record.researchDocId = doc.id;
    } else {
      record.reviewStatus = "rejected";
      record.reviewedBy = actorId;
      record.reviewedAt = now;
      record.updatedAt = now;
      db.researchDocs = db.researchDocs.filter((doc) => doc.sourceRecordId !== record.id);
      record.researchDocId = null;
    }
    return record;
  });
}

export async function listSourceRecords(): Promise<(SourceRecord & { duplicates: DuplicateCandidate[] })[]> {
  return read((db) => [...db.sourceRecords]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((record) => ({ ...record, duplicates: findDuplicateCandidates(record, db.sourceRecords) })));
}

export async function sourceLibraryStats(): Promise<{
  total: number;
  verified: number;
  drafts: number;
  rejected: number;
  auctionLots: number;
  institutions: number;
  realisedBuyerTotals: number;
  probableDuplicates: number;
}> {
  return read((db) => ({
    total: db.sourceRecords.length,
    verified: db.sourceRecords.filter((record) => record.reviewStatus === "verified").length,
    drafts: db.sourceRecords.filter((record) => record.reviewStatus === "draft").length,
    rejected: db.sourceRecords.filter((record) => record.reviewStatus === "rejected").length,
    auctionLots: db.sourceRecords.filter((record) => record.kind === "auction-lot").length,
    institutions: db.sourceRecords.filter((record) => record.sourceType === "museum" || record.sourceType === "institution").length,
    realisedBuyerTotals: db.sourceRecords.filter((record) => Boolean(record.realisedPrice)).length,
    probableDuplicates: db.sourceRecords.filter((record) => findDuplicateCandidates(record, db.sourceRecords).some((candidate) => candidate.score >= 0.82)).length,
  }));
}
