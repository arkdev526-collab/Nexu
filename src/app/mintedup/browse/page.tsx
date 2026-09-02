import Link from "next/link";
import { CATEGORIES, categoryName } from "@/mintedup/categories";
import { currentBid, settleDueAuctions } from "@/mintedup/listings";
import { tokenize } from "@/mintedup/research";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";
import { ListingCard } from "../_components/ListingCard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Browse" };

type Search = Promise<{ category?: string; format?: string; q?: string; sort?: string }>;

const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "ending", label: "Ending soonest" },
  { id: "price-asc", label: "Price low to high" },
  { id: "price-desc", label: "Price high to low" },
];

export default async function BrowsePage({ searchParams }: { searchParams: Search }) {
  await ensureSeeded();
  await settleDueAuctions();

  const params = await searchParams;
  const category = params.category ?? "";
  const format = params.format === "bid" || params.format === "buy" ? params.format : "";
  const query = (params.q ?? "").trim();
  const sort = params.sort ?? "newest";

  const { listings, bids } = await read((db) => ({
    listings: db.listings.filter((l) => l.status === "active"),
    bids: db.bids,
  }));

  const terms = tokenize(query);
  const filtered = listings
    .filter((l) => (category ? l.categoryId === category : true))
    .filter((l) => (format ? l.format === format : true))
    .filter((l) => {
      if (terms.length === 0) return true;
      const haystack = [
        l.title, l.subtitle, l.description, categoryName(l.categoryId),
        l.attributes.maker, l.attributes.period, l.attributes.origin,
        l.attributes.marks, ...l.attributes.materials, ...l.seo.keywords,
      ]
        .join(" ")
        .toLowerCase();
      // Every term must appear somewhere — narrowing beats ranking at this size.
      return terms.every((term) => haystack.includes(term));
    });

  const priceOf = (l: (typeof listings)[number]) =>
    l.format === "bid" ? currentBid(l, bids).amount : l.price;

  const sorted = [...filtered].sort((a, b) => {
    // Boosted lots lead the catalogue whatever the sort — that is what the
    // shop tier is buying — but only within the seller's slot allowance, which
    // the boost endpoint enforces.
    if (Boolean(a.boostedAt) !== Boolean(b.boostedAt)) return a.boostedAt ? -1 : 1;
    switch (sort) {
      case "ending":
        return (a.endsAt ? Date.parse(a.endsAt) : Infinity) - (b.endsAt ? Date.parse(b.endsAt) : Infinity);
      case "price-asc":
        return priceOf(a) - priceOf(b);
      case "price-desc":
        return priceOf(b) - priceOf(a);
      default:
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }
  });

  const chip = (active: boolean) =>
    `mu-sans rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
      active
        ? "border-[var(--mu-brass)] bg-[rgba(216,180,90,0.14)] text-[var(--mu-brass)]"
        : "border-[var(--mu-line)] text-[var(--mu-muted)] hover:border-[var(--mu-line-strong)] hover:text-[var(--mu-text)]"
    }`;

  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams(
      Object.entries({ category, format, q: query, sort }).filter(([, v]) => v) as [string, string][],
    );
    if (value) next.set(key, value);
    else next.delete(key);
    return `/mintedup/browse${next.toString() ? `?${next}` : ""}`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
      <h1 className="mu-display text-4xl">
        {category
          ? categoryName(category)
          : format === "bid"
            ? "Live auctions"
            : format === "buy"
              ? "Buy it now"
              : "The catalogue"}
      </h1>
      <p className="mu-sans mt-2 text-[var(--mu-muted)]">
        {sorted.length} {sorted.length === 1 ? "lot" : "lots"}
        {query ? ` matching “${query}”` : ""}
      </p>

      <form className="mu-sans mt-8 flex flex-wrap gap-2" action="/mintedup/browse">
        <input
          className="mu-input max-w-sm flex-1"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search marks, makers, materials, periods…"
          aria-label="Search the catalogue"
        />
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {format ? <input type="hidden" name="format" value={format} /> : null}
        <button className="mu-btn mu-btn-primary" type="submit">
          Search
        </button>
      </form>

      <div className="mu-sans mt-6 flex flex-wrap items-center gap-2">
        <Link className={chip(!format)} href={withParam("format", "")}>
          Everything
        </Link>
        <Link className={chip(format === "buy")} href={withParam("format", "buy")}>
          Buy it
        </Link>
        <Link className={chip(format === "bid")} href={withParam("format", "bid")}>
          Bid it
        </Link>
        <span className="mx-2 h-4 w-px bg-[var(--mu-line)]" />
        {SORTS.map((option) => (
          <Link key={option.id} className={chip(sort === option.id)} href={withParam("sort", option.id)}>
            {option.label}
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr]">
        <aside>
          <p className="mu-label">Category</p>
          <ul className="mu-sans space-y-1">
            <li>
              <Link
                className={`block rounded-md px-2 py-1.5 text-sm transition ${
                  category
                    ? "text-[var(--mu-muted)] hover:text-[var(--mu-text)]"
                    : "bg-[rgba(216,180,90,0.1)] text-[var(--mu-brass)]"
                }`}
                href={withParam("category", "")}
              >
                All categories
              </Link>
            </li>
            {CATEGORIES.map((item) => (
              <li key={item.id}>
                <Link
                  className={`block rounded-md px-2 py-1.5 text-sm transition ${
                    category === item.id
                      ? "bg-[rgba(216,180,90,0.1)] text-[var(--mu-brass)]"
                      : "text-[var(--mu-muted)] hover:text-[var(--mu-text)]"
                  }`}
                  href={withParam("category", item.id)}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <div>
          {sorted.length === 0 ? (
            <div className="mu-frame rounded-xl p-10 text-center">
              <p className="mu-display text-2xl">Nothing matches that yet.</p>
              <p className="mu-sans mt-3 text-[var(--mu-muted)]">
                Try a broader search, or take the object to the research gateway and find out what
                to call it.
              </p>
              <Link className="mu-btn mu-btn-ghost mu-sans mt-6" href="/mintedup/research">
                Open the research gateway
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {sorted.map((listing) => {
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
          )}
        </div>
      </div>
    </div>
  );
}
