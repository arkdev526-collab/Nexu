import Link from "next/link";
import { categoriesByGroup } from "@/mintedup/categories";
import { PRICING } from "@/mintedup/billing";
import { auctionsWithCounts, refreshAuctionStatuses } from "@/mintedup/curation";
import { formatDate, formatMoney } from "@/mintedup/format";
import { FREE_LISTING_ALLOWANCE } from "@/mintedup/membership";
import { currentBid, settleDueAuctions } from "@/mintedup/listings";
import { learningStats } from "@/mintedup/research";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";
import { ListingCard } from "./_components/ListingCard";

export const dynamic = "force-dynamic";

const DOORS = [
  {
    href: "/mintedup/browse?format=buy",
    eyebrow: "Buy it",
    title: "Priced and ready",
    body: "Curated dealer stock at a fixed price, described with its faults. One click and it is yours.",
  },
  {
    href: "/mintedup/sales",
    eyebrow: "Bid it",
    title: "Curated sales",
    body: "Scheduled sales, every lot read by a curator. Proxy bidding, and a clock that extends on every late bid so sniping does not work.",
  },
  {
    href: "/mintedup/research",
    eyebrow: "Research it",
    title: "The research gateway",
    body: "Work out what you have before you list it. The gateway learns from every object that passes through it.",
  },
];

export default async function MintedUpHome() {
  await ensureSeeded();
  await refreshAuctionStatuses();
  await settleDueAuctions();

  const { listings, bids } = await read((db) => ({
    listings: db.listings
      .filter((l) => l.status === "active")
      // Boosted lots lead — the shop tier's promotion, honoured on the front page.
      .sort((a, b) => (Boolean(b.boostedAt) ? 1 : 0) - (Boolean(a.boostedAt) ? 1 : 0))
      .slice(0, 8),
    bids: db.bids,
  }));
  const sales = (await auctionsWithCounts()).filter((s) => s.status !== "closed").slice(0, 3);
  const stats = await learningStats();
  const groups = categoriesByGroup();

  return (
    <>
      <section className="border-b border-[var(--mu-line)]">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
          <p className="mu-sans text-xs uppercase tracking-[0.28em] text-[var(--mu-brass)]">
            Antiques &amp; collectibles only
          </p>
          <h1 className="mu-display mt-5 max-w-3xl text-balance text-4xl leading-[1.08] sm:text-5xl lg:text-6xl">
            Buy it, bid it, or research it before anyone else knows what it is.
          </h1>
          <p className="mu-sans mt-6 max-w-2xl text-lg leading-relaxed text-[var(--mu-muted)]">
            A curated marketplace for antiques and collectibles, with a research gateway built into
            it. Sellers are admitted by invitation and every lot is read by a curator before it is
            catalogued — so what you are looking at has already been through someone who knows.
          </p>
          <div className="mu-sans mt-9 flex flex-wrap gap-3">
            <Link className="mu-btn mu-btn-primary" href="/mintedup/browse">
              Browse the catalogue
            </Link>
            <Link className="mu-btn mu-btn-ghost" href="/mintedup/apply">
              Apply to sell
            </Link>
          </div>
          <p className="mu-sans mt-4 text-sm text-[var(--mu-muted)]">
            {FREE_LISTING_ALLOWANCE} free listings when you are approved, then{" "}
            {formatMoney(PRICING.subscription)} a month for a shop.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {DOORS.map((door) => (
            <Link
              key={door.href}
              href={door.href}
              className="mu-frame group rounded-xl p-6 transition"
            >
              <p className="mu-sans text-xs uppercase tracking-[0.2em] text-[var(--mu-brass)]">
                {door.eyebrow}
              </p>
              <h2 className="mu-display mt-3 text-2xl">{door.title}</h2>
              <p className="mu-sans mt-3 text-sm leading-relaxed text-[var(--mu-muted)]">
                {door.body}
              </p>
              <span className="mu-sans mt-5 inline-block text-sm font-semibold text-[var(--mu-brass)] transition group-hover:translate-x-1">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {sales.length > 0 ? (
        <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="mu-display text-3xl">The sale calendar</h2>
            <Link className="mu-sans text-sm font-semibold text-[var(--mu-brass)]" href="/mintedup/sales">
              All sales →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {sales.map((sale) => (
              <Link key={sale.id} href={`/mintedup/sales/${sale.id}`} className="mu-frame rounded-xl p-6">
                <span
                  className={`mu-sans inline-block rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] ${
                    sale.status === "live"
                      ? "bg-[var(--mu-verdigris)] text-[#04120e]"
                      : "bg-[rgba(216,180,90,0.18)] text-[var(--mu-brass)]"
                  }`}
                >
                  {sale.status === "live" ? "Bidding now" : "Coming up"}
                </span>
                <h3 className="mu-display mt-3 text-xl">{sale.title}</h3>
                <p className="mu-sans mt-1 text-sm text-[var(--mu-muted)]">{sale.strapline}</p>
                <p className="mu-sans mt-3 text-xs text-[var(--mu-muted)]">
                  {sale.liveLotCount} lot{sale.liveLotCount === 1 ? "" : "s"} ·{" "}
                  {sale.status === "live"
                    ? `closes ${formatDate(sale.closesAt)}`
                    : `opens ${formatDate(sale.opensAt)}`}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {listings.length > 0 ? (
        <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="mu-display text-3xl">Currently on Minted Up</h2>
            <Link
              className="mu-sans text-sm font-semibold text-[var(--mu-brass)]"
              href="/mintedup/browse"
            >
              See everything →
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {listings.map((listing) => {
              const bid = currentBid(listing, bids);
              return (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  currentBid={bid.amount}
                  bidCount={bid.count}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="mu-frame rounded-xl p-8 lg:p-10">
          <h2 className="mu-display text-3xl">The gateway that gets sharper</h2>
          <p className="mu-sans mt-4 max-w-3xl text-[var(--mu-muted)]">
            The research gateway is not a static encyclopaedia. It reads a curated reference layer,
            every attribution sellers confirm, and — the part that matters — what each object
            actually sold for. Four feedback loops, weighted so that the market has the last word.
          </p>
          <div className="mu-sans mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: stats.corpusSize, label: "Documents in the corpus" },
              { value: stats.pricedComparables, label: "Realised prices on file" },
              { value: stats.events, label: "Learning signals recorded" },
              { value: Object.keys(stats.byTier).length, label: "Evidence tiers, reference first" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="mu-display text-4xl text-[var(--mu-brass)]">{stat.value}</p>
                <p className="mt-1 text-sm text-[var(--mu-muted)]">{stat.label}</p>
              </div>
            ))}
          </div>
          <Link
            className="mu-btn mu-btn-ghost mu-sans mt-8"
            href="/mintedup/standards"
          >
            How the learning works
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 pb-20 sm:px-6 lg:px-8">
        <h2 className="mu-display mb-6 text-3xl">What Minted Up deals in</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <div key={group.group}>
              <p className="mu-label">{group.group}</p>
              <ul className="mu-sans space-y-1.5">
                {group.items.map((category) => (
                  <li key={category.id}>
                    <Link
                      className="text-sm text-[var(--mu-muted)] transition hover:text-[var(--mu-brass)]"
                      href={`/mintedup/browse?category=${category.id}`}
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
