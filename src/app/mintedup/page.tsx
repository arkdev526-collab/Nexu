import Link from "next/link";
import { categoriesByGroup } from "@/mintedup/categories";
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
    body: "Dealer stock at a fixed price, described with its faults. One click and it is yours.",
  },
  {
    href: "/mintedup/browse?format=bid",
    eyebrow: "Bid it",
    title: "Live auctions",
    body: "Proxy bidding of the kind the saleroom uses. Enter your maximum; we bid the minimum to keep you in front.",
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
  await settleDueAuctions();

  const { listings, bids } = await read((db) => ({
    listings: db.listings.filter((l) => l.status === "active").slice(0, 8),
    bids: db.bids,
  }));
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
            Minted Up is a marketplace for antiques and collectibles with a research gateway built
            into it. Every mark you look up, every attribution you confirm and every price the
            market settles on makes the next search better.
          </p>
          <div className="mu-sans mt-9 flex flex-wrap gap-3">
            <Link className="mu-btn mu-btn-primary" href="/mintedup/browse">
              Browse the catalogue
            </Link>
            <Link className="mu-btn mu-btn-ghost" href="/mintedup/sell">
              List an object
            </Link>
          </div>
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
