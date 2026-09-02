"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({
  initialMode,
  initialCode,
}: {
  initialMode: "login" | "register";
  initialCode?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(initialCode ?? "");
  const [invite, setInvite] = useState<{ valid: boolean; email: string; reason: string } | null>(
    null,
  );

  const register = mode === "register";

  /** Check the code before the seller fills in the rest of the form. */
  async function checkCode(value: string) {
    setCode(value);
    setInvite(null);
    if (value.trim().length < 8) return;
    const response = await fetch(`/api/mintedup/apply?code=${encodeURIComponent(value.trim())}`);
    if (response.ok) setInvite(await response.json());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/mintedup/auth/${register ? "register" : "login"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "That did not work. Try again.");
      return;
    }
    router.push("/mintedup/dashboard");
    router.refresh();
  }

  return (
    <form className="mu-sans space-y-4" onSubmit={submit}>
      <div className="flex gap-1 rounded-lg border border-[var(--mu-line)] p-1">
        {(["login", "register"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option);
              setError(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
              mode === option
                ? "bg-[rgba(216,180,90,0.16)] text-[var(--mu-brass)]"
                : "text-[var(--mu-muted)]"
            }`}
          >
            {option === "login" ? "Sign in" : "Redeem an invite"}
          </button>
        ))}
      </div>

      {register ? (
        <>
          <div>
            <label className="mu-label" htmlFor="inviteCode">
              Invitation code
            </label>
            <input
              className="mu-input font-mono uppercase"
              id="inviteCode"
              name="inviteCode"
              required
              value={code}
              onChange={(event) => checkCode(event.target.value)}
              placeholder="MU-XXXXX-XXXXX"
            />
            {invite ? (
              <p
                className={`mt-1.5 text-xs ${
                  invite.valid ? "text-[var(--mu-verdigris)]" : "text-[var(--mu-alert)]"
                }`}
              >
                {invite.valid
                  ? `Valid — issued to ${invite.email}. Register with that address.`
                  : invite.reason}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-[var(--mu-muted)]">
                Minted Up is invite-only.{" "}
                <a className="text-[var(--mu-brass)] hover:underline" href="/mintedup/apply">
                  Apply for membership
                </a>{" "}
                if you do not have a code.
              </p>
            )}
          </div>
          <div>
            <label className="mu-label" htmlFor="displayName">
              Your name
            </label>
            <input className="mu-input" id="displayName" name="displayName" required />
          </div>
          <div>
            <label className="mu-label" htmlFor="shopName">
              Shop name
            </label>
            <input
              className="mu-input"
              id="shopName"
              name="shopName"
              required
              placeholder="Hallmark Row"
            />
          </div>
        </>
      ) : null}

      <div>
        <label className="mu-label" htmlFor="email">
          Email
        </label>
        <input
          className="mu-input"
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={register && invite?.valid ? invite.email : undefined}
          key={register && invite?.valid ? invite.email : "email"}
        />
      </div>

      <div>
        <label className="mu-label" htmlFor="password">
          Password
        </label>
        <input
          className="mu-input"
          id="password"
          name="password"
          type="password"
          required
          minLength={register ? 10 : 1}
          autoComplete={register ? "new-password" : "current-password"}
        />
        {register ? (
          <p className="mt-1.5 text-xs text-[var(--mu-muted)]">At least 10 characters.</p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-[var(--mu-alert)] bg-[rgba(224,118,78,0.1)] px-3 py-2 text-sm text-[var(--mu-alert)]">
          {error}
        </p>
      ) : null}

      <button className="mu-btn mu-btn-primary w-full" type="submit" disabled={busy}>
        {busy ? "Working…" : register ? "Open my shop" : "Sign in"}
      </button>
    </form>
  );
}
