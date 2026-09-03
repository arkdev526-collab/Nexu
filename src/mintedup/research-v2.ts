import { tokenize } from "./research";
import { read } from "./store";
import type {
  Database,
  LearningEvent,
  ResearchDoc,
  ResearchSignal,
  ResearchSourceType,
  SignalType,
} from "./types";

type Currency = "GBP" | "USD" | "EUR";
export type ConfidenceBand = "strong" | "moderate" | "tentative";

const SIGNAL_TYPES: SignalType[] = [
  "mark", "maker", "material", "form", "motif", "period", "origin", "condition",
  "dimension", "keyword",
];
const SIGNAL_TYPE_SET = new Set<SignalType>(SIGNAL_TYPES);

/** Physical/object attributes matter more than generic keyword overlap. */
export const COMPARABLE_ATTRIBUTE_WEIGHT: Record<SignalType, number> = {
  mark: 5,
  maker: 4.5,
  material: 3.5,
  form: 4,
  motif: 2,
  period: 2.5,
  origin: 2.5,
  condition: 2.5,
  dimension: 2.5,
  keyword: 0.75,
};

const SIGNAL_SOURCE_WEIGHT: Record<ResearchSignal["source"], number> = {
  confirmed: 1,
  user: 0.75,
  ai: 0.35,
  rejected: -0.8,
};
const CRITICAL_CONFLICT = new Set<SignalType>(["mark", "maker", "form"]);

const SOURCE_TYPE_TRUST: Record<ResearchSourceType, number> = {
  museum: 0.99,
  institution: 0.96,
  "auction-house": 0.92,
  dealer: 0.68,
  marketplace: 0.82,
  seller: 0.42,
  "mintedup-reference": 0.78,
  "mintedup-demo": 0.55,
};

const TIER_CATEGORY_WEIGHT: Record<ResearchDoc["tier"], number> = {
  reference: 1.65,
  market: 1.2,
  community: 0.3,
};

/** Identity learning is deliberately weaker than sale-price learning. */
const IDENTITY_EVENT_WEIGHT: Record<LearningEvent["kind"], number> = {
  query: 0.06,
  suggestion_shown: 0,
  suggestion_accepted: 0.9,
  suggestion_rejected: 0,
  signal_added: 0.45,
  listing_published: 1.1,
  sale_outcome: 0.8,
  no_sale_outcome: 0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function typedTerm(raw: string): { type: SignalType; value: string } | null {
  const split = raw.indexOf(":");
  if (split <= 0) return null;
  const type = raw.slice(0, split) as SignalType;
  if (!SIGNAL_TYPE_SET.has(type)) return null;
  const value = raw.slice(split + 1).trim();
  return value ? { type, value } : null;
}

function attributesOf(doc: ResearchDoc): Map<SignalType, string[]> {
  const attributes = new Map<SignalType, string[]>();
  for (const raw of doc.terms) {
    const parsed = typedTerm(raw);
    if (!parsed) continue;
    const values = attributes.get(parsed.type) ?? [];
    values.push(parsed.value);
    attributes.set(parsed.type, values);
  }
  return attributes;
}

function normalised(value: string): string {
  return tokenize(value).join(" ");
}

function valuesMatch(a: string, b: string): boolean {
  const left = normalised(a);
  const right = normalised(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const leftTerms = new Set(left.split(" "));
  const rightTerms = new Set(right.split(" "));
  const overlap = [...leftTerms].filter((term) => rightTerms.has(term)).length;
  return overlap / Math.max(1, Math.min(leftTerms.size, rightTerms.size)) >= 0.6;
}

export type EvidenceSource = {
  type: ResearchSourceType;
  label: string;
  url: string | null;
  record: string | null;
  verified: boolean;
  trust: number;
  observedAt: string | null;
};

export function evidenceSource(doc: ResearchDoc): EvidenceSource {
  let type: ResearchSourceType;
  if (doc.sourceType) type = doc.sourceType;
  else if (doc.tier === "market" && doc.sourceListingId) type = "marketplace";
  else if (doc.tier === "market") type = "mintedup-demo";
  else if (doc.tier === "reference") type = "mintedup-reference";
  else type = "seller";

  const fallbackLabel =
    type === "marketplace"
      ? "Minted Up realised sale"
      : type === "mintedup-demo"
        ? "Minted Up demo market seed"
        : type === "mintedup-reference"
          ? "Minted Up reference seed"
          : type === "seller"
            ? "Seller-contributed research"
            : type.replace(/-/g, " ");
  const verified = doc.sourceVerified ?? (type === "marketplace" && Boolean(doc.sourceListingId));
  const trust = clamp(SOURCE_TYPE_TRUST[type] + (verified ? 0.04 : 0), 0.2, 1);
  return {
    type,
    label: doc.sourceName?.trim() || fallbackLabel,
    url: doc.sourceUrl?.trim() || null,
    record: doc.sourceRecord?.trim() || doc.sourceListingId || null,
    verified,
    trust: Number(trust.toFixed(2)),
    observedAt: doc.observedAt ?? doc.createdAt ?? null,
  };
}

function docTerms(doc: ResearchDoc): string[] {
  return [...doc.terms.flatMap(tokenize), ...tokenize(doc.title), ...tokenize(doc.body)];
}

type IndexEntry = {
  doc: ResearchDoc;
  terms: string[];
  length: number;
  tf: Map<string, number>;
  source: EvidenceSource;
};

type ResearchIndex = {
  docs: IndexEntry[];
  df: Map<string, number>;
  avgLength: number;
  termCategory: Map<string, Map<string, number>>;
  categoryTotals: Map<string, number>;
  signature: string;
};

const indexCache = globalThis as typeof globalThis & { __mintedUpResearchV2Index?: ResearchIndex };
const K1 = 1.35;
const B = 0.72;

function signatureOf(db: Database): string {
  const weighted = db.researchDocs.reduce((sum, doc, index) => sum + doc.weight * (index + 1), 0);
  return `${db.researchDocs.length}:${db.learningEvents.length}:${db.learningEvents.at(-1)?.id ?? ""}:${weighted.toFixed(3)}`;
}

function buildIndex(db: Database): ResearchIndex {
  const docs = db.researchDocs.map((doc) => {
    const terms = docTerms(doc);
    const tf = new Map<string, number>();
    for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);
    return { doc, terms, length: terms.length, tf, source: evidenceSource(doc) };
  });

  const df = new Map<string, number>();
  for (const entry of docs) {
    for (const term of new Set(entry.terms)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const termCategory = new Map<string, Map<string, number>>();
  const categoryTotals = new Map<string, number>();
  const bump = (term: string, categoryId: string, weight: number) => {
    if (weight <= 0) return;
    const row = termCategory.get(term) ?? new Map<string, number>();
    row.set(categoryId, (row.get(categoryId) ?? 0) + weight);
    termCategory.set(term, row);
    categoryTotals.set(categoryId, (categoryTotals.get(categoryId) ?? 0) + weight);
  };

  // A community contributor can teach a term/category association once. This
  // stops one prolific or malicious seller from multiplying the same claim by
  // publishing near-duplicate listings.
  const communitySeen = new Set<string>();
  for (const entry of docs) {
    const feedback = clamp(entry.doc.weight, -4, 4) * 0.025;
    const base = TIER_CATEGORY_WEIGHT[entry.doc.tier] * entry.source.trust * (1 + feedback);
    for (const term of new Set(entry.terms)) {
      if (entry.doc.tier === "community") {
        const contributor = entry.doc.contributedBy ?? entry.doc.id;
        const key = `${contributor}:${entry.doc.categoryId}:${term}`;
        if (communitySeen.has(key)) continue;
        communitySeen.add(key);
      }
      bump(term, entry.doc.categoryId, base);
    }
  }

  // User-generated category evidence is capped per person/term/category. A
  // search cannot become infinitely true just because someone repeats it.
  const eventTotals = new Map<string, number>();
  for (const event of db.learningEvents) {
    if (!event.categoryId) continue;
    const intended = IDENTITY_EVENT_WEIGHT[event.kind];
    if (intended <= 0) continue;
    const actor = event.userId ?? `anonymous:${event.sessionId ?? "global"}`;
    for (const term of new Set(event.terms.flatMap(tokenize))) {
      const key = `${actor}:${event.categoryId}:${term}`;
      const used = eventTotals.get(key) ?? 0;
      const cap = event.userId ? 3 : 0.25;
      const applied = Math.min(intended, Math.max(0, cap - used));
      if (applied <= 0) continue;
      eventTotals.set(key, used + applied);
      bump(term, event.categoryId, applied);
    }
  }

  const avgLength = docs.length
    ? docs.reduce((sum, entry) => sum + entry.length, 0) / docs.length
    : 1;
  return { docs, df, avgLength, termCategory, categoryTotals, signature: signatureOf(db) };
}

function getIndex(db: Database): ResearchIndex {
  const signature = signatureOf(db);
  if (indexCache.__mintedUpResearchV2Index?.signature !== signature) {
    indexCache.__mintedUpResearchV2Index = buildIndex(db);
  }
  return indexCache.__mintedUpResearchV2Index;
}

type AttributeFit = {
  score: number;
  coverage: number;
  matched: string[];
  conflicts: string[];
  criticalConflicts: number;
};

function attributeFit(doc: ResearchDoc, signals: ResearchSignal[]): AttributeFit {
  const attributes = attributesOf(doc);
  const positives = signals.filter((signal) => signal.source !== "rejected" && signal.value.trim());
  const rejected = signals.filter((signal) => signal.source === "rejected" && signal.value.trim());
  const totalPossible = positives.reduce(
    (sum, signal) => sum + COMPARABLE_ATTRIBUTE_WEIGHT[signal.type] * Math.max(0.2, SIGNAL_SOURCE_WEIGHT[signal.source]),
    0,
  );
  let compared = 0;
  let matchedWeight = 0;
  let conflictWeight = 0;
  let criticalConflicts = 0;
  const matched: string[] = [];
  const conflicts: string[] = [];

  for (const signal of positives) {
    const values = attributes.get(signal.type) ?? [];
    if (values.length === 0) continue;
    const weight = COMPARABLE_ATTRIBUTE_WEIGHT[signal.type] * Math.max(0.2, SIGNAL_SOURCE_WEIGHT[signal.source]);
    compared += weight;
    if (values.some((value) => valuesMatch(signal.value, value))) {
      matchedWeight += weight;
      matched.push(`${signal.type}: ${signal.value}`);
    } else {
      conflictWeight += weight;
      if (CRITICAL_CONFLICT.has(signal.type)) criticalConflicts += 1;
      conflicts.push(`${signal.type}: expected ${signal.value}; source records ${values.slice(0, 2).join(" / ")}`);
    }
  }

  for (const signal of rejected) {
    const values = attributes.get(signal.type) ?? [];
    if (!values.some((value) => valuesMatch(signal.value, value))) continue;
    const weight = COMPARABLE_ATTRIBUTE_WEIGHT[signal.type] * 0.8;
    conflictWeight += weight;
    if (CRITICAL_CONFLICT.has(signal.type)) criticalConflicts += 1;
    conflicts.push(`${signal.type}: source contains rejected feature ${signal.value}`);
  }

  const denominator = matchedWeight + conflictWeight;
  const score = denominator > 0
    ? clamp((matchedWeight - conflictWeight * 0.65) / denominator, 0, 1)
    : 0;
  return {
    score,
    coverage: totalPossible > 0 ? clamp(compared / totalPossible, 0, 1) : 0,
    matched,
    conflicts,
    criticalConflicts,
  };
}

type RawHit = {
  entry: IndexEntry;
  rawScore: number;
  matchedTerms: string[];
};

function bm25(index: ResearchIndex, queryTerms: string[]): RawHit[] {
  const N = index.docs.length;
  if (N === 0) return [];
  const unique = [...new Set(queryTerms)];
  return index.docs
    .map((entry) => {
      let rawScore = 0;
      const matchedTerms: string[] = [];
      for (const term of unique) {
        const tf = entry.tf.get(term);
        if (!tf) continue;
        matchedTerms.push(term);
        const df = index.df.get(term) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const norm = tf * (K1 + 1);
        const denom = tf + K1 * (1 - B + (B * entry.length) / index.avgLength);
        rawScore += idf * (norm / denom);
      }
      const feedback = clamp(entry.doc.weight, -4, 4) * 0.03;
      rawScore *= (0.74 + entry.source.trust * 0.36) * (1 + feedback);
      return { entry, rawScore, matchedTerms };
    })
    .filter((hit) => hit.rawScore > 0)
    .sort((a, b) => b.rawScore - a.rawScore);
}

export type ResearchV2Hit = {
  doc: ResearchDoc;
  score: number;
  matchScore: number;
  matchedTerms: string[];
  attributeMatches: string[];
  attributeConflicts: string[];
  source: EvidenceSource;
  snippet: string;
};

function snippetFor(doc: ResearchDoc, terms: string[]): string {
  const sentences = doc.body.split(/(?<=[.!?])\s+/);
  const best = sentences.find((sentence) => {
    const lower = sentence.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });
  return (best ?? sentences[0] ?? doc.body).slice(0, 280);
}

function rankDocuments(
  index: ResearchIndex,
  terms: string[],
  signals: ResearchSignal[],
  categoryId: string | null,
): ResearchV2Hit[] {
  const raw = bm25(index, terms);
  const top = raw[0]?.rawScore ?? 1;
  const hasSignals = signals.some((signal) => signal.value.trim());
  return raw
    .map((hit) => {
      const lexical = clamp(hit.rawScore / top, 0, 1);
      const fit = attributeFit(hit.entry.doc, signals);
      let matchScore = hasSignals
        ? lexical * 0.25 + fit.score * 0.5 + fit.coverage * 0.15 + hit.entry.source.trust * 0.1
        : lexical * 0.82 + hit.entry.source.trust * 0.18;
      if (categoryId && hit.entry.doc.categoryId !== categoryId) matchScore *= 0.62;
      if (fit.criticalConflicts > 0) matchScore *= Math.max(0.35, 0.58 - (fit.criticalConflicts - 1) * 0.12);
      return {
        doc: hit.entry.doc,
        score: Number(hit.rawScore.toFixed(3)),
        matchScore: Number(clamp(matchScore, 0, 1).toFixed(3)),
        matchedTerms: hit.matchedTerms,
        attributeMatches: fit.matched,
        attributeConflicts: fit.conflicts,
        source: hit.entry.source,
        snippet: snippetFor(hit.entry.doc, terms),
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore || b.score - a.score);
}

export type CategorySuggestionV2 = {
  categoryId: string;
  probability: number;
  evidence: string[];
};

function suggestCategories(index: ResearchIndex, terms: string[], limit = 4): CategorySuggestionV2[] {
  const categories = [...index.categoryTotals.keys()];
  if (categories.length === 0 || terms.length === 0) return [];
  const vocabulary = index.termCategory.size || 1;
  const grandTotal = [...index.categoryTotals.values()].reduce((a, b) => a + b, 0) || 1;
  const unique = [...new Set(terms)];
  const scored = categories.map((categoryId) => {
    const total = index.categoryTotals.get(categoryId) ?? 0;
    let logProb = Math.log(Math.max(total / grandTotal, Number.EPSILON));
    const evidence: { term: string; lift: number }[] = [];
    for (const term of unique) {
      const count = index.termCategory.get(term)?.get(categoryId) ?? 0;
      const likelihood = (count + 1) / (total + vocabulary);
      logProb += Math.log(likelihood);
      if (count > 0) evidence.push({ term, lift: count / (total + 1) });
    }
    evidence.sort((a, b) => b.lift - a.lift);
    return { categoryId, logProb, evidence: evidence.slice(0, 4).map((entry) => entry.term) };
  });
  const max = Math.max(...scored.map((entry) => entry.logProb));
  const weighted = scored.map((entry) => ({ ...entry, weight: Math.exp(entry.logProb - max) }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  return weighted
    .map((entry) => ({
      categoryId: entry.categoryId,
      probability: entry.weight / totalWeight,
      evidence: entry.evidence,
    }))
    .filter((entry) => entry.evidence.length > 0 || entry.probability > 0.16)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit);
}

export type ComparableEvidence = {
  docId: string;
  title: string;
  price: number;
  currency: Currency;
  listingId: string | null;
  matchScore: number;
  matchedAttributes: string[];
  conflicts: string[];
  sourceLabel: string;
  sourceType: ResearchSourceType;
  sourceVerified: boolean;
  observedAt: string | null;
};

export type PriceGuidanceV2 = {
  low: number;
  mid: number;
  high: number;
  currency: Currency;
  sampleSize: number;
  confidence: number;
  basis: "matched-sales" | "category-average" | "insufficient-data";
  comparables: ComparableEvidence[];
  askingPricesExcluded: number;
  qualityNote: string;
};

const PRIOR_STRENGTH = 4;

function roundGuidance(minor: number): number {
  const step = minor < 5_000 ? 100 : minor < 50_000 ? 500 : minor < 500_000 ? 2_500 : 10_000;
  return Math.max(step, Math.round(minor / step) * step);
}

function priceGuidance(
  index: ResearchIndex,
  ranked: ResearchV2Hit[],
  categoryId: string | null,
  signals: ResearchSignal[],
  currency: Currency,
): PriceGuidanceV2 {
  const askingPricesExcluded = index.docs.filter((entry) => {
    const price = entry.doc.askingPrice ?? entry.doc.realisedPrice ?? 0;
    return entry.doc.priceBasis === "asking" && price > 0 && entry.doc.currency === currency;
  }).length;
  const realised = index.docs.filter((entry) =>
    entry.doc.priceBasis !== "asking" &&
    Boolean(entry.doc.realisedPrice && entry.doc.realisedPrice > 0) &&
    entry.doc.currency === currency,
  );
  const empty: PriceGuidanceV2 = {
    low: 0,
    mid: 0,
    high: 0,
    currency,
    sampleSize: 0,
    confidence: 0,
    basis: "insufficient-data",
    comparables: [],
    askingPricesExcluded,
    qualityNote: "No realised sales in this currency are available yet.",
  };
  if (realised.length === 0) return empty;

  const categoryPool = categoryId
    ? realised.filter((entry) => entry.doc.categoryId === categoryId)
    : realised;
  const pool = categoryPool.length > 0 ? categoryPool : realised;
  const priorLogs = pool.map((entry) => Math.log(entry.doc.realisedPrice as number));
  const priorMean = priorLogs.reduce((a, b) => a + b, 0) / priorLogs.length;
  const priorSd = Math.sqrt(
    priorLogs.reduce((sum, value) => sum + (value - priorMean) ** 2, 0) / Math.max(1, priorLogs.length - 1),
  ) || 0.6;

  const signalCount = signals.filter((signal) => signal.source !== "rejected" && signal.value.trim()).length;
  const matched = ranked.filter((hit) => {
    if (!hit.doc.realisedPrice || hit.doc.priceBasis === "asking" || hit.doc.currency !== currency) return false;
    if (categoryId && hit.doc.categoryId !== categoryId) return false;
    const fit = attributeFit(hit.doc, signals);
    if (fit.criticalConflicts > 0) return false;
    if (signalCount > 0) return hit.matchScore >= 0.42 && fit.coverage >= 0.25;
    return hit.matchScore >= 0.48 && hit.matchedTerms.length >= 2;
  }).slice(0, 25);

  if (matched.length === 0) {
    return {
      low: roundGuidance(Math.exp(priorMean - priorSd)),
      mid: roundGuidance(Math.exp(priorMean)),
      high: roundGuidance(Math.exp(priorMean + priorSd)),
      currency,
      sampleSize: pool.length,
      confidence: pool.length >= 4 ? 0.2 : 0.12,
      basis: "category-average",
      comparables: [],
      askingPricesExcluded,
      qualityNote: "No physically close realised-sale comparables passed the Research v2 match gate, so this range is only the category prior.",
    };
  }

  const weights = matched.map((hit) => Math.max(0.05, hit.matchScore * hit.source.trust));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const sampleMean = matched.reduce(
    (sum, hit, index) => sum + Math.log(hit.doc.realisedPrice as number) * weights[index],
    0,
  ) / totalWeight;
  const sampleVariance = matched.reduce((sum, hit, index) => {
    const delta = Math.log(hit.doc.realisedPrice as number) - sampleMean;
    return sum + delta * delta * weights[index];
  }, 0) / totalWeight;
  const sampleSd = Math.sqrt(sampleVariance) || priorSd;
  const n = matched.length;
  const shrink = n / (n + PRIOR_STRENGTH);
  const posterior = shrink * sampleMean + (1 - shrink) * priorMean;
  const spread = Math.max(0.18, priorSd * (1 - 0.45 * shrink) + sampleSd * 0.35 * shrink);
  const avgMatch = matched.reduce((sum, hit) => sum + hit.matchScore, 0) / n;
  const avgTrust = matched.reduce((sum, hit) => sum + hit.source.trust, 0) / n;
  const avgCoverage = signalCount > 0
    ? matched.reduce((sum, hit) => sum + attributeFit(hit.doc, signals).coverage, 0) / n
    : Math.min(1, matched.reduce((sum, hit) => sum + hit.matchedTerms.length, 0) / Math.max(1, n * 4));
  const confidence = clamp(shrink * (avgMatch * 0.55 + avgTrust * 0.3 + avgCoverage * 0.15), 0, 0.95);

  return {
    low: roundGuidance(Math.exp(posterior - spread)),
    mid: roundGuidance(Math.exp(posterior)),
    high: roundGuidance(Math.exp(posterior + spread)),
    currency,
    sampleSize: n,
    confidence: Number(confidence.toFixed(2)),
    basis: "matched-sales",
    askingPricesExcluded,
    qualityNote: "Only realised sales in the selected currency are used. Physical attribute conflicts can exclude a lexical match from valuation.",
    comparables: matched.slice(0, 6).map((hit) => ({
      docId: hit.doc.id,
      title: hit.doc.title,
      price: hit.doc.realisedPrice as number,
      currency,
      listingId: hit.doc.sourceListingId,
      matchScore: hit.matchScore,
      matchedAttributes: hit.attributeMatches,
      conflicts: hit.attributeConflicts,
      sourceLabel: hit.source.label,
      sourceType: hit.source.type,
      sourceVerified: hit.source.verified,
      observedAt: hit.source.observedAt,
    })),
  };
}

export type AttributeSuggestionV2 = {
  type: SignalType;
  value: string;
  support: number;
  seenIn: string[];
};

function suggestAttributes(hits: ResearchV2Hit[], limit = 8): AttributeSuggestionV2[] {
  const tally = new Map<string, { type: SignalType; value: string; support: number; seenIn: Set<string> }>();
  for (const hit of hits.slice(0, 12)) {
    for (const raw of hit.doc.terms) {
      const parsed = typedTerm(raw);
      if (!parsed) continue;
      const key = `${parsed.type}:${parsed.value.toLowerCase()}`;
      const row = tally.get(key) ?? { type: parsed.type, value: parsed.value, support: 0, seenIn: new Set<string>() };
      row.support += hit.matchScore * hit.source.trust * COMPARABLE_ATTRIBUTE_WEIGHT[parsed.type];
      row.seenIn.add(hit.doc.title);
      tally.set(key, row);
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.support - a.support)
    .slice(0, limit)
    .map((row) => ({
      type: row.type,
      value: row.value,
      support: Number(row.support.toFixed(2)),
      seenIn: [...row.seenIn].slice(0, 3),
    }));
}

const QUESTION: Record<SignalType, string> = {
  mark: "What is stamped, impressed or painted on the base? Record it exactly, including numbers and punctuation.",
  maker: "Is there a maker, retailer, workshop or foundry name anywhere on the object?",
  material: "What is it physically made from, and what observation supports that material call?",
  form: "What is the exact form or function — vase, bowl, charger, salver, bureau, figure, case or something else?",
  motif: "Describe the decoration, subject and technique rather than only the colour.",
  period: "Is there a dateable mark, construction feature, hallmark, registration number or documented date?",
  origin: "Is there evidence for country, region, factory or workshop of origin?",
  condition: "Record chips, cracks, restoration, replacement parts, polishing, overpaint and other value-critical faults.",
  dimension: "Give height, width and depth, with units; scale differences can make an otherwise similar comparable misleading.",
  keyword: "What other unusual feature would distinguish this object from a superficially similar one?",
};

function nextQuestions(hits: ResearchV2Hit[], signals: ResearchSignal[]): string[] {
  const known = new Set(signals.filter((signal) => signal.source !== "rejected" && signal.value.trim()).map((signal) => signal.type));
  const spread = new Map<SignalType, Set<string>>();
  for (const hit of hits.slice(0, 12)) {
    for (const raw of hit.doc.terms) {
      const parsed = typedTerm(raw);
      if (!parsed) continue;
      const values = spread.get(parsed.type) ?? new Set<string>();
      values.add(normalised(parsed.value));
      spread.set(parsed.type, values);
    }
  }
  return [...spread.entries()]
    .filter(([type]) => !known.has(type))
    .sort((a, b) => {
      const weightedA = a[1].size * COMPARABLE_ATTRIBUTE_WEIGHT[a[0]];
      const weightedB = b[1].size * COMPARABLE_ATTRIBUTE_WEIGHT[b[0]];
      return weightedB - weightedA;
    })
    .slice(0, 3)
    .map(([type]) => QUESTION[type]);
}

export type EvidenceSummaryV2 = {
  documentsConsidered: number;
  referenceSources: number;
  marketRecords: number;
  communitySources: number;
  verifiedSources: number;
  askingPricesExcluded: number;
};

export type IdentificationAssessment = {
  confidence: number;
  band: ConfidenceBand;
  reasons: string[];
  cautions: string[];
};

function assessment(
  hits: ResearchV2Hit[],
  categories: CategorySuggestionV2[],
  signals: ResearchSignal[],
  price: PriceGuidanceV2,
): IdentificationAssessment {
  if (hits.length === 0) {
    return {
      confidence: 0.08,
      band: "tentative",
      reasons: [],
      cautions: ["No corpus evidence currently matches this description."],
    };
  }
  const confirmed = signals.filter((signal) => signal.source === "confirmed" && signal.value.trim()).length;
  const observed = signals.filter((signal) => signal.source !== "rejected" && signal.value.trim()).length;
  const trustedHits = hits.slice(0, 5).filter((hit) => hit.source.trust >= 0.75).length;
  const referenceHits = hits.slice(0, 5).filter((hit) => hit.doc.tier === "reference").length;
  const top = categories[0]?.probability ?? 0;
  const gap = top - (categories[1]?.probability ?? 0);
  let confidence = 0.12 + top * 0.32 + Math.min(0.2, confirmed * 0.1) + Math.min(0.16, trustedHits * 0.04) + Math.min(0.12, observed * 0.03) + Math.min(0.08, Math.max(0, gap) * 0.3);
  confidence = clamp(confidence, 0.08, 0.9);
  const reasons: string[] = [];
  const cautions: string[] = [];
  if (confirmed > 0) reasons.push(`${confirmed} observation${confirmed === 1 ? "" : "s"} explicitly confirmed.`);
  if (referenceHits > 0) reasons.push(`${referenceHits} reference-tier source${referenceHits === 1 ? "" : "s"} among the strongest matches.`);
  if (trustedHits > 0) reasons.push(`${trustedHits} high-trust source${trustedHits === 1 ? "" : "s"} in the top evidence set.`);
  if (confirmed === 0) cautions.push("No suggested attribute has been explicitly confirmed yet.");
  if (referenceHits === 0) cautions.push("No reference-tier source appears in the top five matches.");
  if (categories.length > 1 && gap < 0.12) cautions.push("The leading categories remain close; more distinguishing physical evidence is needed.");
  if (price.basis === "category-average") cautions.push("The value range is a category prior, not a close-comparable estimate.");
  if (price.basis === "insufficient-data") cautions.push("There is not enough realised-price evidence for a value range.");
  return {
    confidence: Number(confidence.toFixed(2)),
    band: confidence >= 0.72 ? "strong" : confidence >= 0.45 ? "moderate" : "tentative",
    reasons,
    cautions,
  };
}

export type ResearchV2Result = {
  version: 2;
  query: string;
  terms: string[];
  hits: ResearchV2Hit[];
  categories: CategorySuggestionV2[];
  attributes: AttributeSuggestionV2[];
  price: PriceGuidanceV2;
  nextQuestions: string[];
  corpusSize: number;
  evidence: EvidenceSummaryV2;
  assessment: IdentificationAssessment;
};

export async function researchV2(input: {
  query: string;
  categoryId?: string | null;
  signals?: ResearchSignal[];
  currency?: Currency;
}): Promise<ResearchV2Result> {
  const signals = input.signals ?? [];
  const signalTerms = signals
    .filter((signal) => signal.source !== "rejected" && signal.value.trim())
    .flatMap((signal) => {
      const repeat = signal.source === "confirmed" ? 4 : signal.source === "user" ? 2 : 1;
      return Array.from({ length: repeat }, () => tokenize(signal.value)).flat();
    });
  const terms = [...tokenize(input.query), ...signalTerms];
  const currency = input.currency ?? "GBP";
  return read((db) => {
    const index = getIndex(db);
    const hits = rankDocuments(index, terms, signals, input.categoryId ?? null).slice(0, 12);
    const categories = suggestCategories(index, terms);
    const price = priceGuidance(index, hits, input.categoryId ?? null, signals, currency);
    const evidence: EvidenceSummaryV2 = {
      documentsConsidered: hits.length,
      referenceSources: hits.filter((hit) => hit.doc.tier === "reference").length,
      marketRecords: hits.filter((hit) => hit.doc.tier === "market").length,
      communitySources: hits.filter((hit) => hit.doc.tier === "community").length,
      verifiedSources: hits.filter((hit) => hit.source.verified).length,
      askingPricesExcluded: price.askingPricesExcluded,
    };
    return {
      version: 2 as const,
      query: input.query,
      terms: [...new Set(terms)],
      hits,
      categories,
      attributes: suggestAttributes(hits),
      price,
      nextQuestions: nextQuestions(hits, signals),
      corpusSize: db.researchDocs.length,
      evidence,
      assessment: assessment(hits, categories, signals, price),
    };
  });
}
