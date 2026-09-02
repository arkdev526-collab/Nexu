import Link from "next/link";
import { describePricing, PRICING } from "@/mintedup/billing";
import { FREE_LISTING_ALLOWANCE, SHOP_BENEFITS } from "@/mintedup/membership";
import { ensureSeeded } from "@/mintedup/seed";
import { ApplyForm } from "../_components/ApplyForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Apply for membership",
  description:
    "Minted Up is invite-only. Apply, and a curator will read your application before issuing an invitation.",
};

export default async function ApplyPage() {
  await ensureSeeded();

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-12 px-5 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
      <div>
        <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">
          Invitation only
        </p>
        <h1 className="mu-display mt-3 text-4xl">You cannot simply join Minted Up.</h1>
        <p className="mu-sans mt-4 leading-relaxed text-[var(--mu-muted)]">
          Every seller is admitted by a curator, and every lot is read by one before it reaches the
          catalogue. That is the whole proposition: a buyer here is not sifting a feed, and a seller
          here is not competing with one.
        </p>

        <h2 className="mu-display mt-10 text-2xl">How it works</h2>
        <ol className="mu-sans mt-4 space-y-4 text-sm leading-relaxed text-[var(--mu-muted)]">
          {[
            ["Apply", "Tell us what you deal in. A curator reads every application."],
            [
              "Get your invitation",
              "Approval issues a single-use code bound to your email address, valid for thirty days.",
            ],
            [
              `Try it — ${FREE_LISTING_ALLOWANCE} free listings`,
              "You arrive as a free member with five listings on the house, so you can put real stock through curation before paying anything.",
            ],
            [
              "Open a shop",
              `£${(PRICING.subscription / 100).toFixed(0)} a month for unlimited listings and the rest of it. Cancel any time.`,
            ],
          ].map(([title, body], index) => (
            <li key={title} className="flex gap-4">
              <span className="mu-display text-2xl text-[var(--mu-brass)]">{index + 1}</span>
              <span>
                <strong className="block text-[var(--mu-text)]">{title}</strong>
                {body}
              </span>
            </li>
          ))}
        </ol>

        <h2 className="mu-display mt-10 text-2xl">What it costs</h2>
        <ul className="mu-sans mt-3 space-y-2 text-sm text-[var(--mu-muted)]">
          {describePricing().map((line) => (
            <li key={line} className="flex gap-2">
              <span className="text-[var(--mu-brass)]">—</span>
              {line}
            </li>
          ))}
        </ul>

        <h2 className="mu-display mt-10 text-2xl">What a shop gets</h2>
        <ul className="mu-sans mt-3 space-y-2 text-sm text-[var(--mu-muted)]">
          {SHOP_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex gap-2">
              <span className="text-[var(--mu-verdigris)]">✓</span>
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mu-frame rounded-xl p-6 lg:p-8">
          <ApplyForm />
        </div>
        <p className="mu-sans mt-4 text-sm text-[var(--mu-muted)]">
          Already have an invitation code?{" "}
          <Link className="text-[var(--mu-brass)] hover:underline" href="/mintedup/signin?mode=register">
            Register with it
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
