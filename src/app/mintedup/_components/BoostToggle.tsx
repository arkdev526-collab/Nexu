"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Shop-tier promotion. Free members see the upgrade path instead of an error. */
export function BoostToggle({
  listingId,
  boosted,
  slots,
}: {
  listingId: string;
  boosted: boolean;
  slots: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (slots === 0) {
    return (
      <a
        className="mu-sans text-xs text-[var(--mu-muted)] hover:text-[var(--mu-brass)]"
        href="/mintedup/membership"
        title="Boosted listings are a shop-member benefit"
      >
        Upgrade
      </a>
    );
  }

  async function toggle() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/mintedup/boost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, boosted: !boosted }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not change the boost.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="mu-sans">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`text-xs font-semibold ${
          boosted ? "text-[var(--mu-brass)]" : "text-[var(--mu-muted)] hover:text-[var(--mu-text)]"
        }`}
      >
        {boosted ? "Boosted ✦" : "Boost"}
      </button>
      {error ? <span className="ml-2 text-[0.625rem] text-[var(--mu-alert)]">{error}</span> : null}
    </span>
  );
}
