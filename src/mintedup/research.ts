import { mutate, newId, read } from "./store";
import type {
  Database,
  LearningEvent,
  Listing,
  ResearchDoc,
  ResearchSignal,
  SignalType,
} from "./types";

/**
 * The research gateway's learning engine.
 *
 * The whole model is derived from two append-only tables — `researchDocs` (the
 * corpus) and `learningEvents` (every interaction) — so it is reproducible,
 * auditable and can be rebuilt from scratch after a bad contribution. Nothing
 * here mutates learned state in place.
 *
 * Four feedback loops feed it, in increasing order of how much they are
 * trusted (see EVENT_WEIGHTS):
 *
 *   1. Implicit    — what a seller searched for. Cheap, plentiful, noisy.
 *   2. Explicit    — "yes, that is the mark" / "no, it isn't". Sparse, strong.
 *   3. Committed   — the attributes that survived into a published listing.
 *   4. Outcome     — what the piece actually sold for. Ground truth, and the
 *                    signal that grades every guess the first three made.
 *
 * Retrieval is BM25 over the corpus; category suggestion is a naive-Bayes
 * posterior over term/category co-occurrence; price guidance is an
 * empirical-Bayes estimate that shrinks a thin sample toward its category mean
 * and reports how thin it was. All three are deliberately simple, transparent
 * and explainable — an appraiser can be told *why* Minted Up said £400.
 *
 * docs/mintedup/research-learning.md explains how to grow this past the point
 * where these methods run out.
 */

/* ------------------------------------------------------------------ *
 * Text handling
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "then", "there", "this",
  "to", "was", "were", "will", "with", "what", "which", "who", "how", "my", "i",
  "some", "any", "very", "can", "you", "your", "about", "into", "over", "just",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9£$€.\s-]/g, " ")
    .split(/[\s-]+/)
    .map((t) => t.replace(/^[.]+|[.]+$/g, ""))
    .filter((t) => t.length > 1 && t.length < 32 && !STOPWORDS.has(t));
}

/** Terms a document contributes to the index: its own terms plus its prose. */
function docTerms(doc: ResearchDoc): string[] {
  return [...doc.terms.flatMap(tokenize), ...tokenize(doc.title), ...tokenize(doc.body)];
}

/* ------------------------------------------------------------------ *
 * Event weighting
 * ------------------------------------------------------------------ */

export const EVENT_WEIGHTS: Record<LearningEvent["kind"], number> = {
  // Loop 1 — implicit. A search tells us two terms co-occur in someone's mind.
  query: 0.1,
  suggestion_shown: 0.02,
  // Loop 2 — explicit. The seller looked at a candidate and judged it.
  suggestion_accepted: 1,
  suggestion_rejected: -1,
  signal_added: 0.5,
  // Loop 3 — committed. Publishing is a costly, considered assertion.
  listing_published: 2,
  // Loop 4 — outcome. The market grades everything above it.
  sale_outcome: 5,
  no_sale_outcome: -1.5,
};

/**
 * A signal's weight also depends on where it came from. A mark the seller
 * explicitly confirmed outranks one the AI proposed and nobody checked.
 */
const SIGNAL_SOURCE_WEIGHT: Record<ResearchSignal["source"], number> = {
  confirmed: 1,
  user: 0.7,
  ai: 0.25,
  rejected: -1,
};

/**
 * Corpus tiers. Curated reference material outranks the crowd, so a popular
 * wrong answer cannot overwrite a documented fact — the anti-poisoning rule.
 */
const TIER_WEIGHT: Record<ResearchDoc["tier"], number> = {
  reference: 1.6,
  market: 1.2,
  community: 0.8,
};

/* ------------------------------------------------------------------ *
 * BM25 index
 * ------------------------------------------------------------------ */

type Index = {
  docs: { doc: ResearchDoc; terms: string[]; length: number; tf: Map<string, number> }[];
  df: Map<string, number>;
  avgLength: number;
  /** count[term][category] — the naive-Bayes contingency table. */
  termCategory: Map<string, Map<string, number>>;
  categoryTotals: Map<string, number>;
  signature: string;
};

const K1 = 1.4;
const B = 0.72;

const indexCache = globalThis as typeof globalThis & { __mintedUpIndex?: Index };

function signatureOf(db: Database): string {
  return `${db.researchDocs.length}:${db.learningEvents.length}:${db.researchDocs.at(-1)?.id ?? ""}`;
}

function buildIndex(db: Database): Index {
  const docs = db.researchDocs.map((doc) => {
    const terms = docTerms(doc);
    const tf = new Map<string, number>();
    for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);
    return { doc, terms, length: terms.length, tf };
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

  // Corpus contributes co-occurrence weighted by tier and accumulated feedback.
  for (const entry of docs) {
    const weight = TIER_WEIGHT[entry.doc.tier] * (1 + Math.max(0, entry.doc.weight) / 10);
    for (const term of new Set(entry.terms)) bump(term, entry.doc.categoryId, weight);
  }
  // Then every learning event replays on top, at its own weight.
  for (const event of db.learningEvents) {
    if (!event.categoryId || event.weight <= 0) continue;
    for (const term of new Set(event.terms.flatMap(tokenize))) {
      bump(term, event.categoryId, event.weight);
    }
  }

  const avgLength = docs.length
    ? docs.reduce((sum, d) => sum + d.length, 0) / docs.length
    : 1;

  return { docs, df, avgLength, termCategory, categoryTotals, signature: signatureOf(db) };
}

function getIndex(db: Database): Index {
  const signature = signatureOf(db);
  if (indexCache.__mintedUpIndex?.signature !== signature) {
    indexCache.__mintedUpIndex = buildIndex(db);
  }
  return indexCache.__mintedUpIndex;
}

export type CorpusHit = {
  doc: ResearchDoc;
  score: number;
  matchedTerms: string[];
};

function bm25(index: Index, queryTerms: string[]): CorpusHit[] {
  const N = index.docs.length;
  if (N === 0) return [];
  const unique = [...new Set(queryTerms)];

  return index.docs
    .map((entry) => {
      let score = 0;
      const matched: string[] = [];
      for (const term of unique) {
        const tf = entry.tf.get(term);
        if (!tf) continue;
        matched.push(term);
        const df = index.df.get(term) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const norm = tf * (K1 + 1);
        const denom = tf + K1 * (1 - B + (B * entry.length) / index.avgLength);
        score += idf * (norm / denom);
      }
      // Tier and accumulated feedback tilt equally-relevant documents.
      score *= TIER_WEIGHT[entry.doc.tier] * (1 + Math.max(-0.5, entry.doc.weight / 20));
      return { doc: entry.doc, score, matchedTerms: matched };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------------ *
 * Category suggestion — naive Bayes over the co-occurrence table
 * ------------------------------------------------------------------ */

export type CategorySuggestion = {
  categoryId: string;
  probability: number;
  /** The terms that pushed this category up, strongest first. */
  evidence: string[];
};

function suggestCategories(index: Index, terms: string[], limit = 4): CategorySuggestion[] {
  const categories = [...index.categoryTotals.keys()];
  if (categories.length === 0) return [];
  const vocabulary = index.termCategory.size || 1;
  const grandTotal = [...index.categoryTotals.values()].reduce((a, b) => a + b, 0) || 1;
  const unique = [...new Set(terms)];

  const scored = categories.map((categoryId) => {
    const total = index.categoryTotals.get(categoryId) ?? 0;
    // Work in log space; a long query would otherwise underflow to zero.
    let logProb = Math.log(total / grandTotal);
    const evidence: { term: string; lift: number }[] = [];
    for (const term of unique) {
      const count = index.termCategory.get(term)?.get(categoryId) ?? 0;
      // Laplace smoothing keeps an unseen term from zeroing the whole category.
      const likelihood = (count + 1) / (total + vocabulary);
      logProb += Math.log(likelihood);
      if (count > 0) evidence.push({ term, lift: count / (total + 1) });
    }
    evidence.sort((a, b) => b.lift - a.lift);
    return { categoryId, logProb, evidence: evidence.slice(0, 4).map((e) => e.term) };
  });

  // Softmax back to readable probabilities.
  const max = Math.max(...scored.map((s) => s.logProb));
  const exps = scored.map((s) => ({ ...s, weight: Math.exp(s.logProb - max) }));
  const sum = exps.reduce((a, b) => a + b.weight, 0) || 1;

  return exps
    .map((s) => ({
      categoryId: s.categoryId,
      probability: s.weight / sum,
      evidence: s.evidence,
    }))
    .filter((s) => s.evidence.length > 0 || s.probability > 0.15)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Price guidance — empirical Bayes over realised sale prices
 * ------------------------------------------------------------------ */

export type PriceGuidance = {
  /** Minor units. */
  low: number;
  mid: number;
  high: number;
  /** How many realised sales the estimate rests on. */
  sampleSize: number;
  /** 0-1. Low means "we shrank hard toward the category average". */
  confidence: number;
  basis: "matched-sales" | "category-average" | "insufficient-data";
  comparables: { title: string; price: number; listingId: string | null }[];
};

/** Shrinkage constant: how many matched sales it takes to trust the sample. */
const PRIOR_STRENGTH = 5;

/**
 * Round a guidance figure to something a person would say out loud. The
 * log-space arithmetic produces values like £1,255.07, which reads as a
 * precision the estimate does not have.
 */
function roundGuidance(minor: number): number {
  const step =
    minor < 5_000 ? 100 : minor < 50_000 ? 500 : minor < 500_000 ? 2_500 : 10_000;
  return Math.max(step, Math.round(minor / step) * step);
}

function priceGuidance(
  index: Index,
  terms: string[],
  categoryId: string | null,
): PriceGuidance {
  const priced = index.docs.filter((d) => d.doc.realisedPrice && d.doc.realisedPrice > 0);
  const empty: PriceGuidance = {
    low: 0, mid: 0, high: 0, sampleSize: 0, confidence: 0,
    basis: "insufficient-data", comparables: [],
  };
  if (priced.length === 0) return empty;

  const categoryPool = categoryId
    ? priced.filter((d) => d.doc.categoryId === categoryId)
    : priced;
  const pool = categoryPool.length > 0 ? categoryPool : priced;

  // Prior: the log-price distribution of the whole category.
  const priorLogs = pool.map((d) => Math.log(d.doc.realisedPrice as number));
  const priorMean = priorLogs.reduce((a, b) => a + b, 0) / priorLogs.length;
  const priorSd = Math.sqrt(
    priorLogs.reduce((a, b) => a + (b - priorMean) ** 2, 0) / Math.max(1, priorLogs.length - 1),
  ) || 0.6;

  // Sample: the sales that actually share terms with this object.
  const hits = bm25(index, terms).filter((h) => h.doc.realisedPrice && h.doc.realisedPrice > 0);
  const matched = hits.filter((h) => h.matchedTerms.length >= 2).slice(0, 25);

  if (matched.length === 0) {
    return {
      low: roundGuidance(Math.exp(priorMean - priorSd)),
      mid: roundGuidance(Math.exp(priorMean)),
      high: roundGuidance(Math.exp(priorMean + priorSd)),
      sampleSize: pool.length,
      confidence: 0.25,
      basis: "category-average",
      comparables: [],
    };
  }

  // Weight each comparable by relevance, so a near-identical piece counts more.
  const totalScore = matched.reduce((a, h) => a + h.score, 0) || 1;
  const sampleMean =
    matched.reduce((a, h) => a + Math.log(h.doc.realisedPrice as number) * h.score, 0) / totalScore;

  const n = matched.length;
  const shrink = n / (n + PRIOR_STRENGTH);
  const posterior = shrink * sampleMean + (1 - shrink) * priorMean;
  // A thin sample keeps the prior's spread; a rich one narrows toward its own.
  const spread = priorSd * (1 - 0.5 * shrink);

  return {
    low: roundGuidance(Math.exp(posterior - spread)),
    mid: roundGuidance(Math.exp(posterior)),
    high: roundGuidance(Math.exp(posterior + spread)),
    sampleSize: n,
    confidence: Number(shrink.toFixed(2)),
    basis: "matched-sales",
    comparables: matched.slice(0, 5).map((h) => ({
      title: h.doc.title,
      price: h.doc.realisedPrice as number,
      listingId: h.doc.sourceListingId,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Attribute suggestion — what other people recorded about similar objects
 * ------------------------------------------------------------------ */

export type AttributeSuggestion = {
  type: SignalType;
  value: string;
  support: number;
  /** Titles of the documents that back this suggestion. */
  seenIn: string[];
};

/**
 * Terms are typed by the prefix the corpus stores them with (`mark:whieldon`),
 * so a suggestion can be offered against the right field in the composer.
 */
function suggestAttributes(index: Index, hits: CorpusHit[], limit = 8): AttributeSuggestion[] {
  const tally = new Map<string, { type: SignalType; value: string; support: number; seenIn: Set<string> }>();

  for (const hit of hits.slice(0, 12)) {
    for (const raw of hit.doc.terms) {
      const [maybeType, ...rest] = raw.split(":");
      if (rest.length === 0) continue;
      const type = maybeType as SignalType;
      const value = rest.join(":").trim();
      if (!value) continue;
      const key = `${type}:${value.toLowerCase()}`;
      const row = tally.get(key) ?? { type, value, support: 0, seenIn: new Set<string>() };
      row.support += hit.score * TIER_WEIGHT[hit.doc.tier];
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

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export type ResearchResult = {
  query: string;
  terms: string[];
  hits: (CorpusHit & { snippet: string })[];
  categories: CategorySuggestion[];
  attributes: AttributeSuggestion[];
  price: PriceGuidance;
  /** What the gateway would most like the seller to tell it next. */
  nextQuestions: string[];
  corpusSize: number;
};

function snippetFor(doc: ResearchDoc, terms: string[]): string {
  const sentences = doc.body.split(/(?<=[.!?])\s+/);
  const best = sentences.find((s) => {
    const lower = s.toLowerCase();
    return terms.some((t) => lower.includes(t));
  });
  return (best ?? sentences[0] ?? doc.body).slice(0, 260);
}

/**
 * The questions with the highest expected information gain, approximated by
 * "which attribute type would most split the current candidate set". Asking
 * these is how the gateway gets better answers out of the next input.
 */
function nextQuestions(hits: CorpusHit[], signals: ResearchSignal[]): string[] {
  const known = new Set(signals.filter((s) => s.source !== "rejected").map((s) => s.type));
  const spread = new Map<SignalType, Set<string>>();

  for (const hit of hits.slice(0, 12)) {
    for (const raw of hit.doc.terms) {
      const [type, ...rest] = raw.split(":");
      if (rest.length === 0) continue;
      const set = spread.get(type as SignalType) ?? new Set<string>();
      set.add(rest.join(":").toLowerCase());
      spread.set(type as SignalType, set);
    }
  }

  const prompts: Record<SignalType, string> = {
    mark: "What is stamped, impressed or painted on the base? Read it out exactly, including any numbers.",
    maker: "Is there a maker's name, retailer's label or foundry stamp anywhere on the piece?",
    material: "What is it made of — and how do you know? Weight, ring, grain and cold-to-the-touch all help.",
    form: "What is the object's form or function? (charger, vesta case, wing armchair...)",
    motif: "Describe the decoration: the subject, the palette, and whether it is hand-painted or transfer-printed.",
    period: "Does anything date it — a registration number, a patent date, a hallmark date letter?",
    origin: "Any indication of where it was made? Country-of-origin marks appeared on imports from 1891.",
    condition: "Describe every fault: chips, hairlines, restoration, replaced parts, overpainting.",
    dimension: "Give height, width and depth in centimetres, and the weight if it is metal.",
    keyword: "Anything else unusual about it?",
  };

  return [...spread.entries()]
    // An attribute we do not know, that the candidates disagree about, is the
    // one worth asking: answering it eliminates the most possibilities.
    .filter(([type]) => !known.has(type))
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 3)
    .map(([type]) => prompts[type])
    .filter(Boolean);
}

export async function research(input: {
  query: string;
  categoryId?: string | null;
  signals?: ResearchSignal[];
}): Promise<ResearchResult> {
  const signals = input.signals ?? [];
  // Signals join the query, weighted by how much they are trusted: a confirmed
  // mark is repeated into the query so BM25 leans on it harder.
  const signalTerms = signals.flatMap((s) => {
    const repeats = Math.max(0, Math.round(SIGNAL_SOURCE_WEIGHT[s.source] * 3));
    return Array.from({ length: repeats }, () => tokenize(s.value)).flat();
  });
  const terms = [...tokenize(input.query), ...signalTerms];

  return read((db) => {
    const index = getIndex(db);
    const hits = bm25(index, terms).slice(0, 10);
    return {
      query: input.query,
      terms: [...new Set(terms)],
      hits: hits.map((h) => ({ ...h, snippet: snippetFor(h.doc, terms) })),
      categories: suggestCategories(index, terms),
      attributes: suggestAttributes(index, hits),
      price: priceGuidance(index, terms, input.categoryId ?? null),
      nextQuestions: nextQuestions(hits, signals),
      corpusSize: db.researchDocs.length,
    };
  });
}

/** Append one interaction to the learning log. This is the only way to teach. */
export async function recordEvent(input: {
  kind: LearningEvent["kind"];
  terms: string[];
  sessionId?: string | null;
  userId?: string | null;
  categoryId?: string | null;
  docId?: string | null;
  value?: number | null;
}): Promise<void> {
  const event: LearningEvent = {
    id: newId("evt"),
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    kind: input.kind,
    terms: input.terms.slice(0, 40),
    categoryId: input.categoryId ?? null,
    docId: input.docId ?? null,
    value: input.value ?? null,
    weight: EVENT_WEIGHTS[input.kind],
    createdAt: new Date().toISOString(),
  };
  await mutate((db) => {
    db.learningEvents.push(event);
    if (event.docId) {
      const doc = db.researchDocs.find((d) => d.id === event.docId);
      // Accepting or rejecting a result reweights the document it came from,
      // so the corpus reorders itself under use.
      if (doc) doc.weight = Number((doc.weight + event.weight).toFixed(3));
    }
  });
}

/**
 * Loop 3: a published listing is a considered assertion about an object.
 * Its attributes enter the corpus as a community document immediately, so the
 * next seller researching the same mark benefits before it even sells.
 */
export async function contributeListing(listing: Listing): Promise<void> {
  const terms = signalTermsFromListing(listing);
  await mutate((db) => {
    const existing = db.researchDocs.find((d) => d.sourceListingId === listing.id);
    const body = [listing.description, listing.attributes.provenance, listing.attributes.condition]
      .filter(Boolean)
      .join(" ")
      .slice(0, 4000);
    if (existing) {
      existing.title = listing.title;
      existing.body = body;
      existing.terms = terms;
      existing.categoryId = listing.categoryId;
      return;
    }
    const doc: ResearchDoc = {
      id: newId("doc"),
      tier: "community",
      title: listing.title,
      body,
      categoryId: listing.categoryId,
      terms,
      realisedPrice: null,
      currency: listing.currency,
      sourceListingId: listing.id,
      contributedBy: listing.sellerId,
      weight: 0,
      createdAt: new Date().toISOString(),
    };
    db.researchDocs.push(doc);
  });
  await recordEvent({
    kind: "listing_published",
    terms,
    categoryId: listing.categoryId,
    userId: listing.sellerId,
    sessionId: listing.researchSessionId,
  });
}

/**
 * Loop 4: the market answers. A sale promotes the listing's document to the
 * `market` tier with a realised price, which is what future price guidance is
 * computed from. A failed auction is recorded too — knowing what did *not*
 * sell at a price is as informative as knowing what did.
 */
export async function recordOutcome(
  listing: Listing,
  outcome: { sold: boolean; price: number | null },
): Promise<void> {
  const terms = signalTermsFromListing(listing);
  await mutate((db) => {
    let doc = db.researchDocs.find((d) => d.sourceListingId === listing.id);
    if (!doc) {
      // A listing can reach a sale without ever passing through publishListing
      // — seeded, imported or migrated stock. The market's verdict is the most
      // valuable signal the engine gets, so create the record rather than drop it.
      doc = {
        id: newId("doc"),
        tier: "community",
        title: listing.title,
        body: [listing.description, listing.attributes.condition].filter(Boolean).join(" ").slice(0, 4000),
        categoryId: listing.categoryId,
        terms,
        realisedPrice: null,
        currency: listing.currency,
        sourceListingId: listing.id,
        contributedBy: listing.sellerId,
        weight: 0,
        createdAt: new Date().toISOString(),
      };
      db.researchDocs.push(doc);
    }
    if (outcome.sold && outcome.price) {
      doc.tier = "market";
      doc.realisedPrice = outcome.price;
      doc.weight = Number((doc.weight + EVENT_WEIGHTS.sale_outcome).toFixed(3));
    } else {
      doc.weight = Number((doc.weight + EVENT_WEIGHTS.no_sale_outcome).toFixed(3));
    }
  });
  await recordEvent({
    kind: outcome.sold ? "sale_outcome" : "no_sale_outcome",
    terms,
    categoryId: listing.categoryId,
    userId: listing.sellerId,
    sessionId: listing.researchSessionId,
    value: outcome.price,
  });
}

/** Typed terms (`mark:...`) are what makes attribute suggestion possible. */
export function signalTermsFromListing(listing: Listing): string[] {
  const a = listing.attributes;
  return [
    a.maker && `maker:${a.maker}`,
    a.period && `period:${a.period}`,
    a.origin && `origin:${a.origin}`,
    a.marks && `mark:${a.marks}`,
    a.conditionGrade && `condition:${a.conditionGrade}`,
    a.dimensions && `dimension:${a.dimensions}`,
    ...a.materials.map((m) => `material:${m}`),
    ...listing.seo.keywords.map((k) => `keyword:${k}`),
  ].filter((t): t is string => Boolean(t));
}

export function termsFromSignals(signals: ResearchSignal[]): string[] {
  return signals
    .filter((s) => s.source !== "rejected")
    .map((s) => `${s.type}:${s.value}`);
}

/** Admin view: how much the engine has actually learned, and from whom. */
export async function learningStats(): Promise<{
  corpusSize: number;
  byTier: Record<string, number>;
  events: number;
  byKind: Record<string, number>;
  pricedComparables: number;
  topTerms: { term: string; docs: number }[];
}> {
  return read((db) => {
    const index = getIndex(db);
    const byTier: Record<string, number> = {};
    for (const doc of db.researchDocs) byTier[doc.tier] = (byTier[doc.tier] ?? 0) + 1;
    const byKind: Record<string, number> = {};
    for (const e of db.learningEvents) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    const topTerms = [...index.df.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([term, docs]) => ({ term, docs }));
    return {
      corpusSize: db.researchDocs.length,
      byTier,
      events: db.learningEvents.length,
      byKind,
      pricedComparables: db.researchDocs.filter((d) => d.realisedPrice).length,
      topTerms,
    };
  });
}
