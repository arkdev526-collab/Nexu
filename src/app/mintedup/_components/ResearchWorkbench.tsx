"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { CATEGORIES, categoryName } from "@/mintedup/categories";
import { formatMoney } from "@/mintedup/format";
import type { AttributeSuggestion, ResearchResult } from "@/mintedup/research";
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
  market: "Sold",
  community: "Seller research",
};

/**
 * The research gateway.
 *
 * Everything the seller does here is a training signal, and the panel on the
 * right shows them exactly what the gateway has learned about their object so
 * far. The "what to tell it next" prompts are the engine asking for the
 * attribute that would most narrow the candidates — that is the mechanism by
 * which each input improves the next answer.
 */
export function ResearchWorkbench({
  signedIn,
  initialQuery,
  initialCategory,
  initialResult,
}: {
  signedIn: boolean;
  initialQuery: string;
  initialCategory: string;
  /** Rendered on the server when the page is opened with a query, so the first
   * result is present in the HTML rather than fetched after hydration. */
  initialResult: ResearchResult | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [signals, setSignals] = useState<ResearchSignal[]>([]);
  const [result, setResult] = useState<ResearchResult | null>(initialResult);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
  const [newSignal, setNewSignal] = useState({ type: "mark" as SignalType, value: "" });

  const runSearch = useCallback(
    async (text: string, category: string, session: string | null) => {
      setBusy(true);
      const response = await fetch("/api/mintedup/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, categoryId: category || null, sessionId: session }),
      });
      const body = await response.json().catch(() => null);
      setBusy(false);
      if (response.ok && body) setResult(body);
    },
    [],
  );

  /** Record an observation. This is what actually teaches the engine. */
  async function addSignal(
    type: SignalType,
    value: string,
    source: ResearchSignal["source"],
    docId?: string,
  ) {
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
    setSignals((prev) => [
      ...prev.filter((s) => !(s.type === type && s.value.toLowerCase() === value.toLowerCase())),
      body.signal,
    ]);
    // Re-run with the new signal folded in: the answer should visibly sharpen.
    void runSearch(query, categoryId, body.sessionId);
  }

  async function rate(docId: string, helpful: boolean, terms: string[]) {
    setFeedback((prev) => ({ ...prev, [docId]: helpful ? "up" : "down" }));
    await fetch("/api/mintedup/research/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, helpful, terms, sessionId, categoryId: categoryId || null }),
    });
  }

  const suggestionKey = (s: AttributeSuggestion) => `${s.type}:${s.value}`;
  const confirmed = new Set(
    signals.filter((s) => s.source !== "rejected").map((s) => `${s.type}:${s.value.toLowerCase()}`),
  );

  return (
    <div className="mu-sans grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-8">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(query, categoryId, sessionId);
          }}
          className="space-y-3"
        >
          <div>
            <label className="mu-label" htmlFor="research-query">
              Describe the object, or type what the mark says
            </label>
            <textarea
              className="mu-input min-h-24"
              id="research-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Blue and white plate, anchor mark on the base, no country of origin, gilding worn at the rim"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              className="mu-input max-w-xs"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-label="Narrow to a category"
            >
              <option value="">Any category</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className={`mu-btn mu-btn-primary ${busy ? "mu-working" : ""}`} type="submit" disabled={busy}>
              {busy ? "Searching…" : "Research it"}
            </button>
          </div>
        </form>

        {result ? (
          <>
            {result.nextQuestions.length > 0 ? (
              <section className="rounded-xl border border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.07)] p-5">
                <h2 className="mu-display text-lg">Tell it this next</h2>
                <p className="mt-1 text-sm text-[var(--mu-muted)]">
                  These are the attributes the candidates disagree about most — answering one
                  eliminates the largest number of possibilities.
                </p>
                <ul className="mt-3 space-y-2 text-sm text-[var(--mu-text)]">
                  {result.nextQuestions.map((question) => (
                    <li key={question} className="flex gap-2">
                      <span className="text-[var(--mu-verdigris)]">?</span>
                      {question}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {result.price.basis !== "insufficient-data" ? (
              <section className="mu-frame rounded-xl p-5">
                <h2 className="mu-display text-lg">What the market has paid</h2>
                <p className="mu-display mt-2 text-3xl text-[var(--mu-brass)]">
                  {formatMoney(result.price.low)} – {formatMoney(result.price.high)}
                </p>
                <p className="mt-1 text-sm text-[var(--mu-muted)]">
                  Midpoint {formatMoney(result.price.mid)} ·{" "}
                  {result.price.basis === "matched-sales"
                    ? `${result.price.sampleSize} comparable sale${result.price.sampleSize === 1 ? "" : "s"}`
                    : "no close comparables — this is the category average"}{" "}
                  · confidence {Math.round(result.price.confidence * 100)}%
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--mu-muted)]">
                  Thin samples are pulled toward the category average rather than presented as
                  precise. The confidence figure is how much weight the matched sales carried
                  against that average.
                </p>
                {result.price.comparables.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm">
                    {result.price.comparables.map((comparable) => (
                      <li key={comparable.title} className="flex justify-between gap-4">
                        <span className="text-[var(--mu-muted)]">{comparable.title}</span>
                        <span className="text-[var(--mu-brass)]">
                          {formatMoney(comparable.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {result.categories.length > 0 ? (
              <section>
                <h2 className="mu-display text-lg">Most likely category</h2>
                <div className="mt-3 space-y-2">
                  {result.categories.map((suggestion) => (
                    <button
                      key={suggestion.categoryId}
                      type="button"
                      onClick={() => setCategoryId(suggestion.categoryId)}
                      className="mu-frame flex w-full items-center justify-between gap-4 rounded-lg px-4 py-3 text-left transition"
                    >
                      <span>
                        <span className="block text-sm text-[var(--mu-text)]">
                          {categoryName(suggestion.categoryId)}
                        </span>
                        {suggestion.evidence.length > 0 ? (
                          <span className="text-xs text-[var(--mu-muted)]">
                            because of: {suggestion.evidence.join(", ")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm font-semibold text-[var(--mu-brass)]">
                        {Math.round(suggestion.probability * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {result.attributes.length > 0 ? (
              <section>
                <h2 className="mu-display text-lg">Does your object have these?</h2>
                <p className="mt-1 text-sm text-[var(--mu-muted)]">
                  Confirming or rejecting one of these is the strongest thing you can tell the
                  gateway — it is worth ten searches.
                </p>
                <ul className="mt-3 space-y-2">
                  {result.attributes.map((suggestion) => {
                    const key = suggestionKey(suggestion);
                    const already = confirmed.has(key.toLowerCase());
                    return (
                      <li
                        key={key}
                        className="mu-frame flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3"
                      >
                        <span>
                          <span className="mu-label mb-0 inline-block">{suggestion.type}</span>
                          <span className="ml-2 text-sm text-[var(--mu-text)]">
                            {suggestion.value}
                          </span>
                          {suggestion.seenIn.length > 0 ? (
                            <span className="block text-xs text-[var(--mu-muted)]">
                              seen in: {suggestion.seenIn.join("; ")}
                            </span>
                          ) : null}
                        </span>
                        {already ? (
                          <span className="text-xs font-semibold text-[var(--mu-verdigris)]">
                            Confirmed
                          </span>
                        ) : (
                          <span className="flex gap-2">
                            <button
                              type="button"
                              className="mu-btn mu-btn-ghost !min-h-8 !px-3 !text-xs"
                              onClick={() =>
                                void addSignal(suggestion.type, suggestion.value, "confirmed")
                              }
                            >
                              Yes, that&rsquo;s it
                            </button>
                            <button
                              type="button"
                              className="mu-btn !min-h-8 !px-3 !text-xs text-[var(--mu-muted)]"
                              onClick={() =>
                                void addSignal(suggestion.type, suggestion.value, "rejected")
                              }
                            >
                              No
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section>
              <h2 className="mu-display text-lg">
                From the corpus
                <span className="ml-2 text-sm font-normal text-[var(--mu-muted)]">
                  {result.corpusSize} documents indexed
                </span>
              </h2>
              {result.hits.length === 0 ? (
                <p className="mu-frame mt-3 rounded-lg p-5 text-sm text-[var(--mu-muted)]">
                  Nothing in the corpus matches that yet. Add what you can see — the mark, the
                  material, the form — and the gateway will keep what you record for the next
                  person who finds one.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {result.hits.map((hit) => (
                    <li key={hit.doc.id} className="mu-frame rounded-lg p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.1em] ${
                            hit.doc.tier === "reference"
                              ? "bg-[rgba(216,180,90,0.18)] text-[var(--mu-brass)]"
                              : hit.doc.tier === "market"
                                ? "bg-[rgba(79,155,134,0.18)] text-[var(--mu-verdigris)]"
                                : "bg-white/5 text-[var(--mu-muted)]"
                          }`}
                        >
                          {TIER_LABEL[hit.doc.tier]}
                        </span>
                        <span className="mu-display text-base text-[var(--mu-text)]">
                          {hit.doc.title}
                        </span>
                        {hit.doc.realisedPrice ? (
                          <span className="text-sm text-[var(--mu-brass)]">
                            {formatMoney(hit.doc.realisedPrice)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--mu-muted)]">
                        {hit.snippet}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-[var(--mu-muted)]">
                          matched: {hit.matchedTerms.slice(0, 6).join(", ")}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            aria-label="This was useful"
                            className={`rounded border border-[var(--mu-line)] px-2 py-0.5 ${
                              feedback[hit.doc.id] === "up"
                                ? "text-[var(--mu-verdigris)]"
                                : "text-[var(--mu-muted)]"
                            }`}
                            onClick={() => void rate(hit.doc.id, true, hit.matchedTerms)}
                          >
                            Useful
                          </button>
                          <button
                            type="button"
                            aria-label="Not my object"
                            className={`rounded border border-[var(--mu-line)] px-2 py-0.5 ${
                              feedback[hit.doc.id] === "down"
                                ? "text-[var(--mu-alert)]"
                                : "text-[var(--mu-muted)]"
                            }`}
                            onClick={() => void rate(hit.doc.id, false, hit.matchedTerms)}
                          >
                            Not mine
                          </button>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className="mu-frame rounded-xl p-8 text-center text-sm text-[var(--mu-muted)]">
            Describe your object above. The gateway searches a curated reference layer, everything
            other sellers have established, and every price the market has actually settled on.
          </p>
        )}
      </div>

      {/* ---- What the gateway has established ---- */}
      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="mu-frame rounded-xl p-5">
          <h2 className="mu-display text-lg">Established so far</h2>
          {signals.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--mu-muted)]">
              Nothing yet. Confirm a suggestion, or record an observation below.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {signals.map((signal) => (
                <li key={signal.id} className="text-sm">
                  <span className="mu-label mb-0 inline-block">{signal.type}</span>
                  <span
                    className={`ml-2 ${
                      signal.source === "rejected"
                        ? "text-[var(--mu-muted)] line-through"
                        : "text-[var(--mu-text)]"
                    }`}
                  >
                    {signal.value}
                  </span>
                  {signal.source === "confirmed" ? (
                    <span className="ml-1 text-xs text-[var(--mu-verdigris)]">✓</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <hr className="mu-rule my-4" />

          <p className="mu-label">Record an observation</p>
          <div className="space-y-2">
            <select
              className="mu-input"
              value={newSignal.type}
              onChange={(event) =>
                setNewSignal((prev) => ({ ...prev, type: event.target.value as SignalType }))
              }
              aria-label="Observation type"
            >
              {SIGNAL_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
            <input
              className="mu-input"
              value={newSignal.value}
              onChange={(event) => setNewSignal((prev) => ({ ...prev, value: event.target.value }))}
              placeholder="What you can see"
            />
            <button
              type="button"
              className="mu-btn mu-btn-ghost w-full"
              disabled={!newSignal.value.trim()}
              onClick={() => {
                void addSignal(newSignal.type, newSignal.value.trim(), "user");
                setNewSignal((prev) => ({ ...prev, value: "" }));
              }}
            >
              Add to the record
            </button>
          </div>

          {sessionId ? (
            <>
              <hr className="mu-rule my-4" />
              <p className="text-xs leading-relaxed text-[var(--mu-muted)]">
                This research is saved. When you list the object, the composer picks it up and the
                gateway keeps learning from what the piece finally sells for.
              </p>
              <a className="mu-btn mu-btn-primary mt-3 w-full" href="/mintedup/sell">
                Turn this into a listing
              </a>
            </>
          ) : signedIn ? null : (
            <p className="mt-4 text-xs text-[var(--mu-muted)]">
              Sign in to save what you establish and carry it into a listing.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
