"use client";

import { useState } from "react";
import type { SeoField } from "@/mintedup/ai";

export type SeoRequest = {
  field: SeoField;
  current: string;
  title: string;
  categoryId: string;
  format: "buy" | "bid";
  price: number;
  currency: string;
  attributes: Record<string, unknown>;
};

/**
 * The AI SEO button that sits beside every text field in the composer.
 *
 * It never overwrites what the seller wrote. The suggestion appears in a panel
 * with the reasoning, and applying it is a separate, deliberate click.
 */
export function AiSeoButton({
  field,
  label,
  getRequest,
  onApply,
}: {
  field: SeoField;
  label: string;
  getRequest: () => SeoRequest;
  onApply: (value: string, keywords: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { value: string; keywords: string[]; rationale: string; assisted: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    const response = await fetch("/api/mintedup/ai/seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getRequest()),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "The assistant could not answer just now.");
      return;
    }
    setResult(body);
  }

  return (
    <div className="mu-sans relative">
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        title={`Generate an SEO-optimised ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--mu-line-strong)] bg-[rgba(216,180,90,0.08)] px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-[var(--mu-brass)] transition hover:bg-[rgba(216,180,90,0.16)] disabled:opacity-50 ${
          busy ? "mu-working" : ""
        }`}
      >
        <span aria-hidden>✦</span>
        {busy ? "Writing…" : "AI SEO"}
      </button>

      {error ? <p className="mt-1 text-xs text-[var(--mu-alert)]">{error}</p> : null}

      {result ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(28rem,calc(100vw-3rem))] rounded-xl border border-[var(--mu-line-strong)] bg-[#100d0a] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="mu-label mb-0">Suggested {label.toLowerCase()}</p>
            <span className="rounded-full border border-[var(--mu-line)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wider text-[var(--mu-muted)]">
              {result.assisted === "claude" ? "Claude" : "Local draft"}
            </span>
          </div>
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--mu-surface-2)] p-3 text-sm leading-relaxed text-[var(--mu-text)]">
            {result.value}
          </p>
          {result.keywords.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--mu-muted)]">
              Keywords: {result.keywords.join(", ")}
            </p>
          ) : null}
          <p className="mt-2 text-xs italic text-[var(--mu-muted)]">{result.rationale}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="mu-btn mu-btn-primary flex-1 !min-h-9 !text-xs"
              onClick={() => {
                onApply(result.value, result.keywords);
                setResult(null);
              }}
            >
              Use this
            </button>
            <button
              type="button"
              className="mu-btn mu-btn-ghost !min-h-9 !text-xs"
              onClick={() => setResult(null)}
            >
              Keep mine
            </button>
          </div>
          <p className="mt-2 text-[0.6875rem] text-[var(--mu-muted)]">
            Check it against the object before you use it. {field === "description" ? "The assistant is told never to assert a fact you have not entered." : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
