"use client";

import { useState } from "react";

export function ApplyForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/mintedup/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "That did not go through. Try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mu-sans rounded-xl border border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.08)] p-6">
        <h2 className="mu-display text-2xl text-[var(--mu-text)]">Application received</h2>
        <p className="mt-3 leading-relaxed text-[var(--mu-muted)]">
          A curator will read it. If we can place what you deal in, you will get an invitation code
          by email — one code, one address, valid for thirty days. It admits you as a free member
          with five listings to try the place out.
        </p>
      </div>
    );
  }

  return (
    <form className="mu-sans space-y-4" onSubmit={submit}>
      <div>
        <label className="mu-label" htmlFor="name">
          Your name
        </label>
        <input className="mu-input" id="name" name="name" required />
      </div>
      <div>
        <label className="mu-label" htmlFor="email">
          Email
        </label>
        <input className="mu-input" id="email" name="email" type="email" required />
        <p className="mt-1 text-xs text-[var(--mu-muted)]">
          Your invitation will be bound to this address and cannot be used from another.
        </p>
      </div>
      <div>
        <label className="mu-label" htmlFor="dealing">
          What do you deal in?
        </label>
        <textarea
          className="mu-input min-h-32"
          id="dealing"
          name="dealing"
          required
          minLength={40}
          placeholder="Georgian and Victorian silver, mostly bought at house sales in the Welsh Marches. Fifteen years in the trade, two fairs a month."
        />
        <p className="mt-1 text-xs text-[var(--mu-muted)]">
          A curator reads this. Be specific about the material, the period and where you source —
          that is what the decision turns on.
        </p>
      </div>
      <div>
        <label className="mu-label" htmlFor="links">
          Anywhere we can see your stock (optional)
        </label>
        <input
          className="mu-input"
          id="links"
          name="links"
          placeholder="A website, a fair you exhibit at, another marketplace"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-[var(--mu-alert)] bg-[rgba(224,118,78,0.1)] px-3 py-2 text-sm text-[var(--mu-alert)]">
          {error}
        </p>
      ) : null}

      <button className="mu-btn mu-btn-primary w-full" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Apply for membership"}
      </button>
    </form>
  );
}
