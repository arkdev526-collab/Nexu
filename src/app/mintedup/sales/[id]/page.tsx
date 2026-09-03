import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryName } from "@/mintedup/categories";
import { refreshAuctionStatuses } from "@/mintedup/curation";
import { formatDate } from "@/mintedup/format";
import { currentBid, settleDueAuctions } from "@/mintedup/listings";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";
import { ListingCard } from "../../_components/ListingCard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const sale = await read((db) => db.auctions.find((a) => a.id === id) ?? null);
  if (!sale) return { title: "Sale not found" };
  return { title: sale.title, description: sale.strapline };
}

export default async function SalePage({ params }: Params) {
  await ensureSeeded();
  await refreshAuctionStatuses();
  await settleDueAuctions();
  const { id } = await params;

  const data = await read((db) => {
    const sale = db.auctions.find((a) => a.id === id);
    if (!sale) return null;
    return {
      sale,
      lots: db.listings.filter((l) => l.auctionId === sale.id && l.status !== "removed"),
      bids: db.bids,
    };
  });

  if (!data) notFound();
  const { sale, lots, bids } = data;
  const liveLots = lots.filter((l) => l.status === "active");
  const reservedLots = lots.filter((l) => l.status === "reserved");
  const soldLots = lots.filter((l) => l.status === "sold");
  const endedLots = lots.filter((l) => l.status === "ended");

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
      <nav className="mu-sans mb-6 text-sm text-[var(--mu-muted)]">
        <Link className="hover:text-[var(--mu-brass)]" href="/mintedup/sales">
          Curated sales
        </Link>
      </nav>

      <header className="mu-frame rounded-xl p-8">
        <span className="mu-sans text-xs uppercase tracking-[0.2em] text-[var(--mu-brass)]">
          {sale.status === "live"
            ? "Bidding now"
            : sale.status === "scheduled"
              ? `Opens ${formatDate(sale.opensAt)}`
              : "Closed"}
        </span>
        <h1 className="mu-display mt-3 text-4xl">{sale.title}</h1>
        <p className="mu-sans mt-2 text-lg text-[var(--mu-muted)]">{sale.strapline}</p>
        <p className="mu-sans mt-4 max-w-3xl leading-relaxed text-[var(--mu-muted)]">
          {sale.description}
        </p>
        <p className="mu-sans mt-4 text-sm text-[var(--mu-muted)]">
          {liveLots.length} live lot{liveLots.length === 1 ? "" : "s"}
          {reservedLots.length > 0
            ? ` · ${reservedLots.length} awaiting payment`
            : ""}
          {soldLots.length > 0 ? ` · ${soldLots.length} sold` : ""}
          {endedLots.length > 0 ? ` · ${endedLots.length} unsold` : ""} ·{" "}
          {sale.status === "closed"
            ? `closed ${formatDate(sale.closesAt)}`
            : `closes ${formatDate(sale.closesAt)}`}
        </p>
        {sale.categoryIds.length > 0 ? (
          <ul className="mu-sans mt-4 flex flex-wrap gap-2">
            {sale.categoryIds.map((categoryId) => (
              <li
                key={categoryId}
                className="rounded-full border border-[var(--mu-line)] px-3 py-1 text-xs text-[var(--mu-muted)]"
              >
                {categoryName(categoryId)}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {lots.length === 0 ? (
        <p className="mu-sans mt-10 text-center text-[var(--mu-muted)]">
          No lots have been catalogued into this sale yet.
        </p>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[...liveLots, ...reservedLots, ...soldLots, ...endedLots].map((lot) => {
            const bid = currentBid(lot, bids);
            return (
              <ListingCard key={lot.id} listing={lot} currentBid={bid.amount} bidCount={bid.count} />
            );
          })}
        </div>
      )}
    </div>
  );
}
