"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/mintedup/format";
import type { Membership } from "@/mintedup/types";

/** Start or cancel the shop subscription. */
export function MembershipPanel({
  membership,
  subscription,
  freeListingsRemaining,
}: {
  membership: Membership;
  subscription: number;
  freeListingsRemaining: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isShop = membership.tier === "shop" && membership.status === "active";

  async function act(action: "subscribe" | "cancel") {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/mintedup/membership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "That did not go through.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mu-sans">
      {isShop ? (
        <>
          <p className="text-sm text-[var(--mu-muted)]">
            Shop membership is active
            {membership.renewsAt
              ? `, renewing ${new Date(membership.renewsAt).toLocaleDateString("en-GB")}`
              : ""}
            . Unlimited listings, no listing fee.
          </p>
          <button
            className="mu-btn mu-btn-ghost mt-3"
            type="button"
            onClick={() => act("cancel")}
            disabled={busy}
          >
            {busy ? "Working…" : "Cancel membership"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--mu-muted)]">
            {membership.status === "cancelled"
              ? "Your shop membership is cancelled. You are on free-tier limits."
              : `Free member — ${freeListingsRemaining} of your five free listings left.`}
          </p>
          <button
            className="mu-btn mu-btn-primary mt-3"
            type="button"
            onClick={() => act("subscribe")}
            disabled={busy}
          >
            {busy ? "Working…" : `Open a shop — ${formatMoney(subscription)} a month`}
          </button>
          <p className="mt-2 text-xs text-[var(--mu-muted)]">
            No card is taken in this build — the charge is recorded on your statement so the
            numbers are right when billing is connected.
          </p>
        </>
      )}
      {error ? <p className="mt-2 text-sm text-[var(--mu-alert)]">{error}</p> : null}
    </div>
  );
}
