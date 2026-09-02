"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/mintedup/format";

/** Buy it / Bid it. The two halves of every Minted Up listing. */
export function SalePanel({
  listingId,
  format,
  price,
  currency,
  minimumBid,
  signedIn,
  isOwner,
  live,
}: {
  listingId: string;
  format: "buy" | "bid";
  price: number;
  currency: string;
  minimumBid: number;
  signedIn: boolean;
  isOwner: boolean;
  live: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState((minimumBid / 100).toFixed(2));
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!live) {
    return (
      <p className="mu-sans rounded-lg border border-[var(--mu-line)] px-4 py-3 text-sm text-[var(--mu-muted)]">
        This lot is closed.
      </p>
    );
  }

  if (isOwner) {
    return (
      <p className="mu-sans rounded-lg border border-[var(--mu-line)] px-4 py-3 text-sm text-[var(--mu-muted)]">
        This is your listing. Manage it from your dashboard.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <a className="mu-btn mu-btn-primary mu-sans w-full" href="/mintedup/signin">
        Sign in to {format === "bid" ? "bid" : "buy"}
      </a>
    );
  }

  async function act() {
    setBusy(true);
    setMessage(null);
    const endpoint = format === "bid" ? "bid" : "buy";
    const response = await fetch(`/api/mintedup/listings/${listingId}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        format === "bid" ? { maxAmount: Math.round(Number(amount) * 100) } : {},
      ),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage({ tone: "bad", text: body.error ?? "That did not go through." });
      return;
    }
    setMessage({
      tone: "ok",
      text:
        format === "bid"
          ? body.leading
            ? `You are the leading bidder at ${formatMoney(body.visibleAmount, currency)}.`
            : `You were outbid — the standing proxy took it to ${formatMoney(body.visibleAmount, currency)}.`
          : "Bought. It is in your dashboard.",
    });
    router.refresh();
  }

  return (
    <div className="mu-sans space-y-3">
      {format === "bid" ? (
        <>
          <label className="mu-label" htmlFor="maxbid">
            Your maximum bid
          </label>
          <input
            className="mu-input"
            id="maxbid"
            type="number"
            step="0.01"
            min={minimumBid / 100}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="text-xs text-[var(--mu-muted)]">
            We bid only what is needed to keep you in front, up to your maximum. Your maximum is
            never shown. Bids in the last five minutes extend the lot.
          </p>
        </>
      ) : (
        <p className="mu-display text-3xl text-[var(--mu-brass)]">
          {formatMoney(price, currency)}
        </p>
      )}

      <button className="mu-btn mu-btn-primary w-full" type="button" onClick={act} disabled={busy}>
        {busy ? "Working…" : format === "bid" ? "Place bid" : "Buy it now"}
      </button>

      {message ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.tone === "ok"
              ? "border border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.1)] text-[var(--mu-verdigris)]"
              : "border border-[var(--mu-alert)] bg-[rgba(224,118,78,0.1)] text-[var(--mu-alert)]"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
