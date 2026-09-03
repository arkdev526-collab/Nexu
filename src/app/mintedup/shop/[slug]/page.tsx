import { notFound } from "next/navigation";
import { categoryName } from "@/mintedup/categories";
import { formatDate } from "@/mintedup/format";
import { currentBid, settleDueAuctions } from "@/mintedup/listings";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";
import { ListingCard } from "../../_components/ListingCard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const user = await read((db) => db.users.find((u) => u.shop.slug === slug) ?? null);
  if (!user) return { title: "Shop not found" };
  return {
    title: user.shop.name,
    description:
      user.shop.tagline ||
      `${user.shop.name} on Minted Up — antiques and collectibles${user.shop.location ? ` from ${user.shop.location}` : ""}.`,
  };
}

export default async function ShopPage({ params }: Params) {
  await ensureSeeded();
  await settleDueAuctions();
  const { slug } = await params;

  const data = await read((db) => {
    const user = db.users.find((u) => u.shop.slug === slug);
    if (!user) return null;
    return {
      user,
      listings: db.listings.filter((l) => l.sellerId === user.id && l.status === "active"),
      sold: db.listings.filter((l) => l.sellerId === user.id && l.status === "sold").length,
      bids: db.bids,
    };
  });

  if (!data) notFound();
  const { user, listings, sold, bids } = data;

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
      <header className="mu-frame rounded-xl p-8">
        <h1 className="mu-display text-4xl">{user.shop.name}</h1>
        {user.shop.tagline ? (
          <p className="mu-sans mt-2 text-lg text-[var(--mu-muted)]">{user.shop.tagline}</p>
        ) : null}
        <p className="mu-sans mt-3 text-sm text-[var(--mu-muted)]">
          {user.shop.location ? `${user.shop.location} · ` : ""}
          {listings.length} lot{listings.length === 1 ? "" : "s"} listed · {sold} sold · trading
          since {formatDate(user.createdAt)}
        </p>
        {user.shop.about ? (
          <p className="mu-sans mt-4 max-w-3xl leading-relaxed text-[var(--mu-muted)]">
            {user.shop.about}
          </p>
        ) : null}
        {user.shop.specialties.length > 0 ? (
          <ul className="mu-sans mt-4 flex flex-wrap gap-2">
            {user.shop.specialties.map((id) => (
              <li
                key={id}
                className="rounded-full border border-[var(--mu-line)] px-3 py-1 text-xs text-[var(--mu-muted)]"
              >
                {categoryName(id)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mu-sans mt-6 grid gap-4 text-sm text-[var(--mu-muted)] sm:grid-cols-2">
          {user.shop.shippingPolicy ? (
            <div>
              <p className="mu-label">Shipping</p>
              {user.shop.shippingPolicy}
            </div>
          ) : null}
          {user.shop.returnsPolicy ? (
            <div>
              <p className="mu-label">Returns</p>
              {user.shop.returnsPolicy}
            </div>
          ) : null}
        </div>
      </header>

      {listings.length > 0 ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
      ) : (
        <p className="mu-sans mt-10 text-center text-[var(--mu-muted)]">
          Nothing listed at the moment.
        </p>
      )}
    </div>
  );
}
