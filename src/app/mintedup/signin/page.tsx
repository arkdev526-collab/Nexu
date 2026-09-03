import { redirect } from "next/navigation";
import { currentUser } from "@/mintedup/auth";
import { DEMO_ACCOUNTS, ensureSeeded } from "@/mintedup/seed";
import { AuthForm } from "../_components/AuthForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; code?: string }>;
}) {
  await ensureSeeded();
  if (await currentUser()) redirect("/mintedup/dashboard");
  const { mode, code } = await searchParams;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-12 px-5 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
      <div>
        <h1 className="mu-display text-4xl">Sell on Minted Up</h1>
        <p className="mu-sans mt-4 leading-relaxed text-[var(--mu-muted)]">
          Minted Up is invite-only. Redeem the code a curator issued you, and you arrive as a free
          member with five listings on the house — the composer with its 30-slot image grid, the AI
          SEO assistant, the beta auto-complete, and the research gateway, all included while you
          try it.
        </p>
        <ul className="mu-sans mt-6 space-y-3 text-sm text-[var(--mu-muted)]">
          {[
            "Every lot read by a curator before it reaches the catalogue.",
            "A photography standard that is measured, not asked for politely.",
            "Everything you research stays attached to the listing it becomes.",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <span className="text-[var(--mu-brass)]">—</span>
              {line}
            </li>
          ))}
        </ul>

        <div className="mu-frame mu-sans mt-10 rounded-xl p-5">
          <p className="mu-label">Demonstration accounts</p>
          <ul className="space-y-2 text-sm text-[var(--mu-muted)]">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <span className="text-[var(--mu-text)]">{account.role}</span> — {account.email} /{" "}
                <code className="text-[var(--mu-brass)]">{account.password}</code>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--mu-muted)]">
            Seeded on first run so the marketplace is explorable. Remove them before going live.{" "}
            <a className="text-[var(--mu-brass)] hover:underline" href="/mintedup/apply">
              Apply for membership
            </a>{" "}
            to go through the real invitation flow.
          </p>
        </div>
      </div>

      <div className="mu-frame h-fit rounded-xl p-6 lg:p-8">
        <AuthForm
          initialMode={mode === "register" || code ? "register" : "login"}
          initialCode={code}
        />
      </div>
    </div>
  );
}
