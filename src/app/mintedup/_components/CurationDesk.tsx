"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { categoryName } from "@/mintedup/categories";
import { CURATION_CHECKLIST } from "@/mintedup/curation-rules";
import type { QueueItem } from "@/mintedup/curation";
import { formatMoney } from "@/mintedup/format";
import type { CuratedAuction } from "@/mintedup/types";

/**
 * The curation desk.
 *
 * A curator reads one lot at a time against the checklist, then approves it
 * into a sale, sends it back with specific changes, or rejects it. The seller
 * sees whatever is typed here verbatim, so the notes field is the product.
 */
export function CurationDesk({
  queue,
  auctions,
}: {
  queue: QueueItem[];
  auctions: CuratedAuction[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [changes, setChanges] = useState("");
  const [auctionId, setAuctionId] = useState(auctions[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (queue.length === 0) {
    return (
      <p className="mu-sans mu-frame rounded-xl p-8 text-center text-[var(--mu-muted)]">
        The queue is empty. Every submitted lot has been dealt with.
      </p>
    );
  }

  const item = queue[Math.min(index, queue.length - 1)];
  const { listing } = item;

  async function decide(action: "approve" | "changes" | "reject") {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/mintedup/curation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        listingId: listing.id,
        notes,
        auctionId: listing.format === "bid" ? auctionId : null,
        changes: changes.split("\n").map((line) => line.trim()).filter(Boolean),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "That decision did not go through.");
      return;
    }
    setNotes("");
    setChanges("");
    setIndex((current) => Math.max(0, Math.min(current, queue.length - 2)));
    router.refresh();
  }

  return (
    <div className="mu-sans grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--mu-muted)]">
            Lot {index + 1} of {queue.length} · {item.sellerName}
            {item.listing.curation.priority ? (
              <span className="ml-2 rounded-full bg-[rgba(216,180,90,0.18)] px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-[var(--mu-brass)]">
                Priority
              </span>
            ) : null}
            <span className="ml-2 text-xs">waiting {item.waitingHours}h</span>
          </p>
          <span className="flex gap-2">
            <button
              className="mu-btn mu-btn-ghost !min-h-9 !text-xs"
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              Previous
            </button>
            <button
              className="mu-btn mu-btn-ghost !min-h-9 !text-xs"
              type="button"
              onClick={() => setIndex((i) => Math.min(queue.length - 1, i + 1))}
              disabled={index >= queue.length - 1}
            >
              Skip
            </button>
          </span>
        </div>

        <div className="mu-frame rounded-xl p-6">
          <h2 className="mu-display text-2xl">{listing.title}</h2>
          <p className="mt-1 text-sm text-[var(--mu-muted)]">
            {categoryName(listing.categoryId)} ·{" "}
            {listing.format === "bid"
              ? `opening ${formatMoney(listing.startingBid, listing.currency)}${
                  listing.reserve ? `, reserve ${formatMoney(listing.reserve, listing.currency)}` : ", no reserve"
                }`
              : formatMoney(listing.price, listing.currency)}
          </p>
          {listing.subtitle ? (
            <p className="mt-2 text-sm text-[var(--mu-muted)]">{listing.subtitle}</p>
          ) : null}

          {listing.images.length > 0 ? (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {listing.images.map((image) => (
                <a
                  key={image.id}
                  href={`/api/mintedup/images/${image.filename}`}
                  target="_blank"
                  rel="noreferrer"
                  className="relative overflow-hidden rounded-md border border-[var(--mu-line)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploads are streamed from the data dir. */}
                  <img
                    src={`/api/mintedup/images/${image.filename}`}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                  <span className="absolute bottom-0 right-0 bg-black/70 px-1 text-[0.5625rem] text-[var(--mu-muted)]">
                    {image.quality.score}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--mu-alert)]">No photographs on this lot.</p>
          )}

          <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--mu-muted)]">
            {listing.description}
          </div>

          <dl className="mt-5 divide-y divide-[var(--mu-line)] border-y border-[var(--mu-line)] text-sm">
            {(
              [
                ["Maker", listing.attributes.maker],
                ["Period", listing.attributes.period],
                ["Origin", listing.attributes.origin],
                ["Materials", listing.attributes.materials.join(", ")],
                ["Marks", listing.attributes.marks],
                ["Dimensions", listing.attributes.dimensions],
                ["Condition", listing.attributes.condition],
                ["Provenance", listing.attributes.provenance],
              ] as [string, string][]
            )
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8rem_1fr] gap-3 py-2">
                  <dt className="text-[var(--mu-muted)]">{label}</dt>
                  <dd className="text-[var(--mu-text)]">{value}</dd>
                </div>
              ))}
          </dl>

          {listing.seo.aiAssistedFields.length > 0 ? (
            <p className="mt-3 text-xs text-[var(--mu-muted)]">
              AI-assisted fields: {listing.seo.aiAssistedFields.join(", ")} — read these
              particularly carefully against the photographs.
            </p>
          ) : null}
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="mu-frame rounded-xl p-5">
          <h3 className="mu-display text-lg">Check</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--mu-muted)]">
            {CURATION_CHECKLIST.map((line) => (
              <li key={line}>— {line}</li>
            ))}
          </ul>

          <hr className="mu-rule my-4" />

          {listing.format === "bid" ? (
            <div className="mb-3">
              <label className="mu-label" htmlFor="auction">
                Place in sale
              </label>
              <select
                className="mu-input"
                id="auction"
                value={auctionId}
                onChange={(event) => setAuctionId(event.target.value)}
              >
                {auctions.length === 0 ? <option value="">No open sales</option> : null}
                {auctions.map((auction) => (
                  <option key={auction.id} value={auction.id}>
                    {auction.title}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--mu-muted)]">
                The lot takes the sale&rsquo;s closing time.
              </p>
            </div>
          ) : null}

          <div className="mb-3">
            <label className="mu-label" htmlFor="notes">
              Note to the seller
            </label>
            <textarea
              className="mu-input min-h-24"
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Marks legible, condition honestly stated. Passed."
            />
          </div>

          <div className="mb-4">
            <label className="mu-label" htmlFor="changes">
              Changes required, one per line
            </label>
            <textarea
              className="mu-input min-h-20"
              id="changes"
              value={changes}
              onChange={(event) => setChanges(event.target.value)}
              placeholder={"Photograph the base mark in raking light\nDeclare the rim restoration"}
            />
          </div>

          {error ? <p className="mb-3 text-sm text-[var(--mu-alert)]">{error}</p> : null}

          <div className="space-y-2">
            <button
              className="mu-btn mu-btn-primary w-full"
              type="button"
              onClick={() => decide("approve")}
              disabled={busy || (listing.format === "bid" && !auctionId)}
            >
              Approve into the catalogue
            </button>
            <button
              className="mu-btn mu-btn-ghost w-full"
              type="button"
              onClick={() => decide("changes")}
              disabled={busy || !changes.trim()}
            >
              Send back for changes
            </button>
            <button
              className="mu-btn w-full text-[var(--mu-alert)]"
              type="button"
              onClick={() => decide("reject")}
              disabled={busy || !notes.trim()}
            >
              Reject
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--mu-muted)]">
            Approving charges the seller&rsquo;s listing fee and adds the lot to the research
            corpus. A rejected lot is never charged for.
          </p>
        </div>
      </aside>
    </div>
  );
}
