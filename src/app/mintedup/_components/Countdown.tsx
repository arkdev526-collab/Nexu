"use client";

import { useEffect, useState } from "react";

/**
 * The closing clock.
 *
 * The current time lives in state and is only ever read inside the timer, so
 * rendering stays pure and there is no server/client hydration mismatch — the
 * clock simply appears on the first tick. It ticks four times a second inside
 * the closing two minutes, which is where the bid extensions land and where a
 * once-a-second clock would visibly lie.
 */
export function Countdown({
  endsAt,
  nextExtensionSeconds,
}: {
  endsAt: string;
  nextExtensionSeconds: number;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const closing = Date.parse(endsAt) - current < 120_000;
      timer = setTimeout(tick, closing ? 250 : 1000);
    };
    // Deferred rather than called here, so the effect body sets no state.
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [endsAt]);

  if (now === null) {
    return <span className="mu-sans text-sm text-[var(--mu-muted)]">Loading the clock…</span>;
  }

  const remaining = Date.parse(endsAt) - now;
  if (remaining <= 0) {
    return <span className="mu-sans text-sm text-[var(--mu-muted)]">Closed</span>;
  }

  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const closing = remaining < 60_000;

  return (
    <span className="mu-sans">
      <span
        className={`font-semibold tabular-nums ${
          closing ? "text-[var(--mu-alert)]" : "text-[var(--mu-text)]"
        }`}
      >
        {days > 0
          ? `${days}d ${hours}h ${minutes}m`
          : hours > 0
            ? `${hours}h ${minutes}m ${secs}s`
            : `${minutes}m ${secs}s`}
      </span>
      {closing ? (
        <span className="ml-2 text-xs text-[var(--mu-alert)]">
          closing — a bid now adds {nextExtensionSeconds}s
        </span>
      ) : null}
    </span>
  );
}
