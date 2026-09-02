import Link from "next/link";
import { categoryName } from "@/mintedup/categories";
import { formatMoney, timeLeft } from "@/mintedup/format";
import type { Listing } from "@/mintedup/types";

/** Deterministic stand-in for a listing with no photograph yet. */
function Placeholder({ seed }: { seed: string }) {
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 40;
  return (
    <div
      aria-hidden
      className="grid h-full w-full place-items-center"
      style={{
        background: `linear-gradient(140deg, hsl(${30 + hue} 22% 14%), hsl(${20 + hue} 18% 9%))`,
      }}
    >
      <span className="mu-sans text-[0.6875rem] uppercase tracking-[0.2em] text-[var(--mu-muted)]">
        No photograph
      </span>
    </div>
  );
}

export function ListingCard({
  listing,
  currentBid,
  bidCount,
}: {
  listing: Listing;
  currentBid?: number;
  bidCount?: number;
}) {
  const cover = listing.images[0];
  const isAuction = listing.format === "bid";
  const remaining = timeLeft(listing.endsAt);

  return (
    <Link
      href={`/mintedup/listing/${listing.id}`}
      className="mu-frame group flex flex-col overflow-hidden rounded-xl transition"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--mu-surface-2)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploads are streamed from the data dir, not the build.
          <img
            src={`/api/mintedup/images/${cover.filename}`}
            alt={cover.alt || listing.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <Placeholder seed={listing.id} />
        )}
        <span
          className={`mu-sans absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] ${
            isAuction
              ? "bg-[var(--mu-verdigris)] text-[#04120e]"
              : "bg-[var(--mu-brass)] text-[#1a1206]"
          }`}
        >
          {isAuction ? "Bid it" : "Buy it"}
        </span>
        {isAuction && remaining ? (
          <span className="mu-sans absolute right-2.5 top-2.5 rounded-full bg-black/70 px-2.5 py-1 text-[0.625rem] font-semibold text-[var(--mu-text)]">
            {remaining}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="mu-sans text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--mu-muted)]">
          {categoryName(listing.categoryId)}
        </p>
        <h3 className="mu-display text-base leading-snug text-[var(--mu-text)]">{listing.title}</h3>
        {listing.subtitle ? (
          <p className="mu-sans line-clamp-2 text-sm text-[var(--mu-muted)]">{listing.subtitle}</p>
        ) : null}
        <div className="mu-sans mt-auto flex items-baseline justify-between gap-2 pt-2">
          <span className="text-lg font-semibold text-[var(--mu-brass)]">
            {formatMoney(isAuction ? (currentBid ?? listing.startingBid) : listing.price, listing.currency)}
          </span>
          <span className="text-xs text-[var(--mu-muted)]">
            {isAuction ? `${bidCount ?? 0} bid${bidCount === 1 ? "" : "s"}` : "Buy it now"}
          </span>
        </div>
      </div>
    </Link>
  );
}
