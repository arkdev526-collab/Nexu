import Link from "next/link";
import { currentUser } from "@/mintedup/auth";
import { PRICING, statementFor } from "@/mintedup/billing";
import { formatDate, formatMoney } from "@/mintedup/format";
import {
  checkQuota,
  ENTITLEMENTS,
  FREE_LISTING_ALLOWANCE,
  isShopMember,
  SHOP_BENEFITS,
} from "@/mintedup/membership";
import { ensureSeeded } from "@/mintedup/seed";
import { MembershipPanel } from "../_components/MembershipPanel";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Membership",
  description:
    "Minted Up membership: five free listings to start, then £20 a month for a shop with unlimited listings, SEO and boosted lots.",
};

const COMPARISON: { feature: string; free: string; shop: string }[] = [
  {
    feature: "Listings",
    free: `${FREE_LISTING_ALLOWANCE} free, then ${PRICING.listingFee}p each`,
    shop: "Unlimited, no listing fee",
  },
  { feature: "Commission on a sale", free: "1%", shop: "1%" },
  {
    feature: "AI SEO rewrites",
    free: `${ENTITLEMENTS.free.aiSeoPerMonth} a month`,
    shop: "Unlimited",
  },
  {
    feature: "Beta auto-complete from photographs",
    free: `${ENTITLEMENTS.free.autocompletePerMonth} a month`,
    shop: "Unlimited",
  },
  { feature: "Boosted lots", free: "—", shop: `${ENTITLEMENTS.shop.boostSlots} at a time` },
  { feature: "Curation queue", free: "Standard", shop: "Priority" },
  { feature: "Verified shop badge", free: "—", shop: "Yes, once curated" },
  { feature: "Sales analytics", free: "—", shop: "Yes" },
  { feature: "Shopfront customisation", free: "—", shop: "Yes" },
  {
    feature: "Longest curated sale",
    free: `${ENTITLEMENTS.free.maxAuctionDays} days`,
    shop: `${ENTITLEMENTS.shop.maxAuctionDays} days`,
  },
  { feature: "Research gateway", free: "Full access", shop: "Full access" },
];

export default async function MembershipPage() {
  await ensureSeeded();
  const user = await currentUser();
  const statement = user ? await statementFor(user.id) : null;
  const aiSeo = user ? checkQuota(user, "aiSeo") : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-6 lg:px-8">
      <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">
        Membership
      </p>
      <h1 className="mu-display mt-3 text-4xl">Five listings on the house, then £20 a month.</h1>
      <p className="mu-sans mt-4 max-w-2xl leading-relaxed text-[var(--mu-muted)]">
        Minted Up is invite-only, and every member starts free with five listings so you can put
        real stock through curation before paying anything. A working dealer outgrows that in a
        fortnight, and the shop is what the platform is built for.
      </p>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="mu-frame rounded-xl p-6">
          <p className="mu-label">Free member</p>
          <p className="mu-display text-3xl">
            £0<span className="text-base text-[var(--mu-muted)]"> — by invitation</span>
          </p>
          <p className="mu-sans mt-3 text-sm leading-relaxed text-[var(--mu-muted)]">
            {FREE_LISTING_ALLOWANCE} free listings, then {PRICING.listingFee}p a listing. 1%
            commission on every sale. Metered AI assistance. Full access to the research gateway.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--mu-brass)] bg-[rgba(216,180,90,0.07)] p-6">
          <p className="mu-label text-[var(--mu-brass)]">Shop member</p>
          <p className="mu-display text-3xl text-[var(--mu-brass)]">
            {formatMoney(PRICING.subscription)}
            <span className="text-base text-[var(--mu-muted)]"> a month</span>
          </p>
          <ul className="mu-sans mt-4 space-y-2 text-sm text-[var(--mu-muted)]">
            {SHOP_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2">
                <span className="text-[var(--mu-verdigris)]">✓</span>
                {benefit}
              </li>
            ))}
          </ul>
          <p className="mu-sans mt-4 text-xs text-[var(--mu-muted)]">
            Commission stays at 1% on both tiers. Cancel any time.
          </p>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="mu-display text-2xl">Side by side</h2>
        <div className="mu-sans mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--mu-line)] text-left">
                <th className="mu-th">Feature</th>
                <th className="mu-th">Free</th>
                <th className="mu-th text-[var(--mu-brass)]">Shop</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.feature} className="border-b border-[var(--mu-line)]">
                  <td className="py-2.5 text-[var(--mu-text)]">{row.feature}</td>
                  <td className="py-2.5 text-[var(--mu-muted)]">{row.free}</td>
                  <td className="py-2.5 text-[var(--mu-brass)]">{row.shop}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {user ? (
        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="mu-frame rounded-xl p-6">
            <h2 className="mu-display text-xl">Your membership</h2>
            <p className="mu-sans mt-1 text-xs text-[var(--mu-muted)]">
              {isShopMember(user)
                ? "Shop member"
                : `Free member since ${formatDate(user.membership.since)}`}
              {aiSeo && aiSeo.limit !== null ? ` · ${aiSeo.remaining} AI SEO rewrites left this month` : ""}
            </p>
            <div className="mt-4">
              <MembershipPanel
                membership={user.membership}
                subscription={PRICING.subscription}
                freeListingsRemaining={user.freeListingsRemaining}
              />
            </div>
          </div>

          {statement ? (
            <div className="mu-frame rounded-xl p-6">
              <h2 className="mu-display text-xl">Your statement</h2>
              <dl className="mu-sans mt-3 space-y-1.5 text-sm">
                {[
                  ["Listing fees", statement.listingFees],
                  ["Commission", statement.commission],
                  ["Subscription", statement.subscription],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between gap-4">
                    <dt className="text-[var(--mu-muted)]">{label}</dt>
                    <dd className="text-[var(--mu-text)]">{formatMoney(Number(value))}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-[var(--mu-line)] pt-2">
                  <dt className="text-[var(--mu-text)]">Total accrued</dt>
                  <dd className="text-[var(--mu-brass)]">{formatMoney(statement.total)}</dd>
                </div>
              </dl>
              {statement.entries.length > 0 ? (
                <ul className="mu-sans mt-4 max-h-52 space-y-1.5 overflow-y-auto text-xs text-[var(--mu-muted)]">
                  {statement.entries.slice(0, 25).map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-3">
                      <span>{entry.description}</span>
                      <span className="whitespace-nowrap text-[var(--mu-text)]">
                        {formatMoney(entry.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mu-sans mt-3 text-xs text-[var(--mu-muted)]">
                Accrued only — no payment is taken in this build.
              </p>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="mu-sans mt-12 flex flex-wrap gap-3">
          <Link className="mu-btn mu-btn-primary" href="/mintedup/apply">
            Apply for membership
          </Link>
          <Link className="mu-btn mu-btn-ghost" href="/mintedup/signin">
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
