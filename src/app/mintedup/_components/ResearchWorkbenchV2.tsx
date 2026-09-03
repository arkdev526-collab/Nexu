"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { CATEGORIES, categoryName } from "@/mintedup/categories";
import { formatDate, formatMoney } from "@/mintedup/format";
import type { AttributeSuggestionV2, ResearchV2Result } from "@/mintedup/research-v2";
import type { ResearchSignal, SignalType } from "@/mintedup/types";

const SIGNAL_TYPES: { id: SignalType; label: string }[] = [
  { id: "mark", label: "Mark" },
  { id: "maker", label: "Maker" },
  { id: "material", label: "Material" },
  { id: "form", label: "Form" },
  { id: "motif", label: "Decoration" },
  { id: "period", label: "Period" },
  { id: "origin", label: "Origin" },
  { id: "condition", label: "Condition" },
  { id: "dimension", label: "Dimensions" },
  { id: "keyword", label: "Other" },
];

const TIER_LABEL: Record<string, string> = {
  reference: "Reference",
  market: "Realised sale",
  community: "Seller research",
};

export function ResearchWorkbenchV2({
  signedIn,
  initialQuery,
  initialCategory,
  initialResult,
}: {
  signedIn: boolean;
  initialQuery: string;
  initialCategory: string;
  initialResult: ResearchV2Result | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [signals, setSignals] = useState<ResearchSignal[]>([]);
  const [result, setResult] = useState<ResearchV2Result | null>(initialResult);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
  const [newSignal, setNewSignal] = useState({ type: "mark" as SignalType, value: "" });

  const runSearch = useCallback(async (text: string, category: string, session: string | null) => {
    setBusy(true);
    try {
      const response = await fetch("/api/mintedup/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, categoryId: category || null, sessionId: session, currency: "GBP" }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body) setResult(body);
    } finally {
      setBusy(false);
    }
  }, []);

  async function addSignal(type: SignalType, value: string, source: ResearchSignal["source"], docId?: string) {
    if (!signedIn) {
      router.push("/mintedup/signin");
      return;
    }
    const response = await fetch("/api/mintedup/research/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        type,
        value,
        source,
        docId,
        categoryId: categoryId || null,
        title: query || value,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) return;
    setSessionId(body.sessionId);
    setSignals((previous) => [...previous.filter((signal) => signal.type !== type), body.signal]);
    void runSearch(query, categoryId, body.sessionId);
  }

  async function rate(docId: string, helpful: boolean) {
    if (!signedIn) {
      router.push("/mintedup/signin");
      return;
    }
    setFeedback((previous) => ({ ...previous, [docId]: helpful ? "up" : "down" }));
    await fetch("/api/mintedup/research/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, helpful, sessionId }),
    });
  }

  const suggestionKey = (suggestion: AttributeSuggestionV2) => `${suggestion.type}:${suggestion.value}`;
  const confirmed = new Set(signals.filter((signal) => signal.source !== "rejected").map((signal) => `${signal.type}:${signal.value.toLowerCase()}`));

  return (
    <div className="mu-sans grid gap-8 lg:grid-cols-[1fr_21rem]">
      <div className="space-y-8">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(query, categoryId, sessionId);
          }}
          className="space-y-3"
        >
          <div>
            <label className="mu-label" htmlFor="research-query-v2">Describe the object and the evidence you can see</label>
            <textarea
              className="mu-input min-h-28"
              id="research-query-v2"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chinese blue and white porcelain vase, 38 cm high, four-character mark, crackle glaze, dragon decoration, old rim repair"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <select className="mu-input max-w-xs" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Narrow to a category">
              <option value="">Any category</option>
              {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <button className={`mu-btn mu-btn-primary ${busy ? "mu-working" : ""}`} type="submit" disabled={busy}>
              {busy ? "Comparing evidence…" : "Research it"}
            </button>
          </div>
        </form>

        {result ? (
          <>
            <section className="mu-frame rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mu-label">Research confidence · not authentication</p>
                  <h2 className="mu-display text-2xl capitalize">{result.assessment.band}</h2>
                </div>
                <span className="mu-display text-3xl text-[var(--mu-brass)]">{Math.round(result.assessment.confidence * 100)}%</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div><p className="text-xl text-[var(--mu-text)]">{result.evidence.referenceSources}</p><p className="text-xs text-[var(--mu-muted)]">reference sources</p></div>
                <div><p className="text-xl text-[var(--mu-text)]">{result.evidence.marketRecords}</p><p className="text-xs text-[var(--mu-muted)]">market records</p></div>
                <div><p className="text-xl text-[var(--mu-text)]">{result.evidence.verifiedSources}</p><p className="text-xs text-[var(--mu-muted)]">verified source records</p></div>
                <div><p className="text-xl text-[var(--mu-text)]">{result.evidence.askingPricesExcluded}</p><p className="text-xs text-[var(--mu-muted)]">asking prices excluded</p></div>
              </div>
              {result.assessment.reasons.length > 0 ? <ul className="mt-4 space-y-1 text-sm text-[var(--mu-text)]">{result.assessment.reasons.map((reason) => <li key={reason}>✓ {reason}</li>)}</ul> : null}
              {result.assessment.cautions.length > 0 ? <ul className="mt-3 space-y-1 text-xs text-[var(--mu-muted)]">{result.assessment.cautions.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}
            </section>

            {result.nextQuestions.length > 0 ? (
              <section className="rounded-xl border border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.07)] p-5">
                <h2 className="mu-display text-lg">Most valuable evidence to add next</h2>
                <p className="mt-1 text-sm text-[var(--mu-muted)]">Research v2 prioritises value-critical physical differences rather than asking generic follow-up questions.</p>
                <ul className="mt-3 space-y-2 text-sm text-[var(--mu-text)]">{result.nextQuestions.map((question) => <li key={question} className="flex gap-2"><span className="text-[var(--mu-verdigris)]">?</span>{question}</li>)}</ul>
              </section>
            ) : null}

            {result.price.basis !== "insufficient-data" ? (
              <section className="mu-frame rounded-xl p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="mu-label">Realised-price evidence only</p>
                    <h2 className="mu-display text-lg">Comparable value range</h2>
                  </div>
                  <span className="text-xs text-[var(--mu-muted)]">confidence {Math.round(result.price.confidence * 100)}%</span>
                </div>
                <p className="mu-display mt-2 text-3xl text-[var(--mu-brass)]">{formatMoney(result.price.low, result.price.currency)} – {formatMoney(result.price.high, result.price.currency)}</p>
                <p className="mt-1 text-sm text-[var(--mu-muted)]">Midpoint {formatMoney(result.price.mid, result.price.currency)} · {result.price.basis === "matched-sales" ? `${result.price.sampleSize} admitted comparable sale${result.price.sampleSize === 1 ? "" : "s"}` : "category prior only"}</p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--mu-muted)]">{result.price.qualityNote}</p>

                {result.price.comparables.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {result.price.comparables.map((comparable) => (
                      <article key={comparable.docId} className="rounded-lg border border-[var(--mu-line)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="mu-display text-base text-[var(--mu-text)]">{comparable.title}</p>
                            <p className="mt-1 text-xs text-[var(--mu-muted)]">{comparable.sourceLabel}{comparable.observedAt ? ` · ${formatDate(comparable.observedAt)}` : ""}{comparable.sourceVerified ? " · verified record" : ""}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-[var(--mu-brass)]">{formatMoney(comparable.price, comparable.currency)}</p>
                            <p className="text-xs text-[var(--mu-muted)]">{Math.round(comparable.matchScore * 100)}% comparable fit</p>
                          </div>
                        </div>
                        {comparable.matchedAttributes.length > 0 ? <p className="mt-3 text-xs text-[var(--mu-verdigris)]">Matches: {comparable.matchedAttributes.join(" · ")}</p> : null}
                        {comparable.conflicts.length > 0 ? <p className="mt-2 text-xs text-[var(--mu-alert)]">Differences: {comparable.conflicts.join(" · ")}</p> : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : (
              <section className="mu-frame rounded-xl p-5 text-sm text-[var(--mu-muted)]">No defensible realised-price range yet. Research v2 will not turn asking prices into market evidence.</section>
            )}

            {result.categories.length > 0 ? (
              <section>
                <h2 className="mu-display text-lg">Category hypotheses</h2>
                <p className="mt-1 text-sm text-[var(--mu-muted)]">These are hypotheses, not facts. Selecting a category is an explicit signal; the model’s own guess is never written back as truth.</p>
                <div className="mt-3 space-y-2">
                  {result.categories.map((suggestion) => (
                    <button key={suggestion.categoryId} type="button" onClick={() => setCategoryId(suggestion.categoryId)} className="mu-frame flex w-full items-center justify-between gap-4 rounded-lg px-4 py-3 text-left transition">
                      <span><span className="block text-sm text-[var(--mu-text)]">{categoryName(suggestion.categoryId)}</span>{suggestion.evidence.length > 0 ? <span className="text-xs text-[var(--mu-muted)]">evidence: {suggestion.evidence.join(", ")}</span> : null}</span>
                      <span className="text-sm font-semibold text-[var(--mu-brass)]">{Math.round(suggestion.probability * 100)}%</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {result.attributes.length > 0 ? (
              <section>
                <h2 className="mu-display text-lg">Test these attributes</h2>
                <p className="mt-1 text-sm text-[var(--mu-muted)]">Marks, maker, form and material carry more weight than generic keywords. Confirm only what you can actually establish from the object or documentary evidence.</p>
                <ul className="mt-3 space-y-2">
                  {result.attributes.map((suggestion) => {
                    const key = suggestionKey(suggestion);
                    const already = confirmed.has(key.toLowerCase());
                    return (
                      <li key={key} className="mu-frame flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3">
                        <span><span className="mu-label mb-0 inline-block">{suggestion.type}</span><span className="ml-2 text-sm text-[var(--mu-text)]">{suggestion.value}</span>{suggestion.seenIn.length > 0 ? <span className="block text-xs text-[var(--mu-muted)]">supported by: {suggestion.seenIn.join("; ")}</span> : null}</span>
                        {already ? <span className="text-xs font-semibold text-[var(--mu-verdigris)]">Confirmed</span> : (
                          <span className="flex gap-2">
                            <button type="button" className="mu-btn mu-btn-ghost !min-h-8 !px-3 !text-xs" onClick={() => void addSignal(suggestion.type, suggestion.value, "confirmed")}>Yes, established</button>
                            <button type="button" className="mu-btn !min-h-8 !px-3 !text-xs text-[var(--mu-muted)]" onClick={() => void addSignal(suggestion.type, suggestion.value, "rejected")}>No</button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section>
              <h2 className="mu-display text-lg">Evidence trail <span className="ml-2 text-sm font-normal text-[var(--mu-muted)]">{result.corpusSize} documents indexed</span></h2>
              <p className="mt-1 text-sm text-[var(--mu-muted)]">Each result shows provenance/trust separately from relevance. A popular seller claim cannot silently become an institutional reference.</p>
              {result.hits.length === 0 ? <p className="mu-frame mt-3 rounded-lg p-5 text-sm text-[var(--mu-muted)]">Nothing in the corpus matches yet. Add physical observations and try again.</p> : (
                <ul className="mt-3 space-y-3">
                  {result.hits.map((hit) => (
                    <li key={hit.doc.id} className="mu-frame rounded-lg p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-[var(--mu-muted)]">{TIER_LABEL[hit.doc.tier]}</span>
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--mu-muted)]">source trust {Math.round(hit.source.trust * 100)}%</span>
                        <span className="rounded-full bg-[rgba(79,155,134,0.12)] px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--mu-verdigris)]">fit {Math.round(hit.matchScore * 100)}%</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="mu-display text-base text-[var(--mu-text)]">{hit.doc.title}</p>
                        {hit.doc.realisedPrice && hit.doc.priceBasis !== "asking" ? <span className="text-sm text-[var(--mu-brass)]">{formatMoney(hit.doc.realisedPrice, hit.doc.currency ?? "GBP")}</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-[var(--mu-muted)]">{hit.source.label}{hit.source.verified ? " · verified record" : ""}{hit.source.observedAt ? ` · ${formatDate(hit.source.observedAt)}` : ""}</p>
                      {hit.source.url ? <a className="mt-1 inline-block text-xs text-[var(--mu-brass)] hover:underline" href={hit.source.url} target="_blank" rel="noreferrer">Open source record</a> : null}
                      <p className="mt-3 text-sm leading-relaxed text-[var(--mu-muted)]">{hit.snippet}</p>
                      {hit.attributeMatches.length > 0 ? <p className="mt-3 text-xs text-[var(--mu-verdigris)]">Physical matches: {hit.attributeMatches.join(" · ")}</p> : null}
                      {hit.attributeConflicts.length > 0 ? <p className="mt-2 text-xs text-[var(--mu-alert)]">Conflicts: {hit.attributeConflicts.join(" · ")}</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-[var(--mu-muted)]">lexical match: {hit.matchedTerms.slice(0, 6).join(", ")}</span>
                        <span className="flex gap-1">
                          <button type="button" className={`rounded border border-[var(--mu-line)] px-2 py-0.5 ${feedback[hit.doc.id] === "up" ? "text-[var(--mu-verdigris)]" : "text-[var(--mu-muted)]"}`} onClick={() => void rate(hit.doc.id, true)}>Useful</button>
                          <button type="button" className={`rounded border border-[var(--mu-line)] px-2 py-0.5 ${feedback[hit.doc.id] === "down" ? "text-[var(--mu-alert)]" : "text-[var(--mu-muted)]"}`} onClick={() => void rate(hit.doc.id, false)}>Not mine</button>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : <p className="mu-frame rounded-xl p-8 text-center text-sm text-[var(--mu-muted)]">Describe your object above. Research v2 separates evidence quality, physical comparability and realised-price data instead of treating every matching word as equal.</p>}
      </div>

      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="mu-frame rounded-xl p-5">
          <p className="mu-label">Research v2</p>
          <h2 className="mu-display text-lg">Established so far</h2>
          {signals.length === 0 ? <p className="mt-2 text-sm text-[var(--mu-muted)]">Nothing confirmed yet. Record what you can actually see, measure or document.</p> : (
            <ul className="mt-3 space-y-2">{signals.map((signal) => <li key={signal.id} className="text-sm"><span className="mu-label mb-0 inline-block">{signal.type}</span><span className={`ml-2 ${signal.source === "rejected" ? "text-[var(--mu-muted)] line-through" : "text-[var(--mu-text)]"}`}>{signal.value}</span>{signal.source === "confirmed" ? <span className="ml-1 text-xs text-[var(--mu-verdigris)]">✓</span> : null}</li>)}</ul>
          )}
          <hr className="mu-rule my-4" />
          <p className="mu-label">Record an observation</p>
          <div className="space-y-2">
            <select className="mu-input" value={newSignal.type} onChange={(event) => setNewSignal((previous) => ({ ...previous, type: event.target.value as SignalType }))} aria-label="Observation type">{SIGNAL_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
            <input className="mu-input" value={newSignal.value} onChange={(event) => setNewSignal((previous) => ({ ...previous, value: event.target.value }))} placeholder="What you can establish" />
            <button type="button" className="mu-btn mu-btn-ghost w-full" disabled={!newSignal.value.trim()} onClick={() => { void addSignal(newSignal.type, newSignal.value.trim(), "user"); setNewSignal((previous) => ({ ...previous, value: "" })); }}>Add evidence</button>
          </div>
          {sessionId ? <><hr className="mu-rule my-4" /><p className="text-xs leading-relaxed text-[var(--mu-muted)]">This evidence record is saved to your account and can be carried into the listing composer.</p><a className="mu-btn mu-btn-primary mt-3 w-full" href="/mintedup/sell">Turn this into a listing</a></> : signedIn ? null : <p className="mt-4 text-xs text-[var(--mu-muted)]">Sign in to save evidence, confirm attributes and rate sources.</p>}
        </div>
      </aside>
    </div>
  );
}
