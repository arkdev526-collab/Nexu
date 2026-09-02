import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, destroySession } from "@/mintedup/auth";
import { categoryName } from "@/mintedup/categories";
import { formatDate, formatMoney, timeLeft } from "@/mintedup/format";
import { currentBid, settleDueAuctions } from "@/mintedup/listings";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your dashboard" };

async function signOut() {
  "use server";
  await destroySession();
  redirect("/mintedup");
}

export default async function DashboardPage() {
  await ensureSeeded();
  await settleDueAuctions();
  const user = await currentUser();
  if (!user) redirect("/mintedup/signin");

  const data = await read((db) => ({
    listings: db.listings
      .filter((l) => l.sellerId === user.id && l.status !== "removed")
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    bids: db.bids,
    myBids: db.bids.filter((b) => b.bidderId === user.id && !b.retracted),
    sales: db.orders.filter((o) => o.sellerId === user.id),
    purchases: db.orders.filter((o) => o.buyerId === user.id),
    research: db.researchSessions
      .filter((s) => s.userId === user.id)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 6),
  }));

  const grossSales = data.sales.reduce((sum, order) => sum + order.amount, 0);
  const active = data.listings.filter((l) => l.status === "active");
  const drafts = data.listings.filter((l) => l.status === "draft");

  // One row per lot the seller is bidding on, at their current standing.
  const biddingOn = [...new Set(data.myBids.map((b) => b.listingId))]
    .map((listingId) => {
      const listing = data.listings.find((l) => l.id === listingId);
      return listing ? null : listingId;
    })
    .filter((id): id is string => Boolean(id));

  const watchedListings = await read((db) =>
    db.listings.filter((l) => biddingOn.includes(l.id)),
  );

  const stats = [
    { label: "Live listings", value: String(active.length) },
    { label: "Drafts", value: String(drafts.length) },
    { label: "Sold", value: String(data.sales.length) },
    { label: "Gross sales", value: formatMoney(grossSales) },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mu-sans text-xs uppercase tracking-[0.2em] text-[var(--mu-brass)]">
            {user.role === "admin" ? "Administrator" : "Seller"}
          </p>
          <h1 className="mu-display mt-2 text-4xl">{user.shop.name}</h1>
          <p className="mu-sans mt-1 text-sm text-[var(--mu-muted)]">
            {user.displayName} · joined {formatDate(user.createdAt)} ·{" "}
            <Link className="text-[var(--mu-brass)]" href={`/mintedup/shop/${user.shop.slug}`}>
              view your shopfront
            </Link>
          </p>
        </div>
        <div className="mu-sans flex flex-wrap gap-2">
          <Link className="mu-btn mu-btn-ghost" href="/mintedup/dashboard/shop">
            Shop settings
          </Link>
          <Link className="mu-btn mu-btn-primary" href="/mintedup/sell">
            New listing
          </Link>
          <form action={signOut}>
            <button className="mu-btn mu-btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mu-sans mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="mu-frame rounded-xl p-5">
            <p className="mu-display text-3xl text-[var(--mu-brass)]">{stat.value}</p>
            <p className="mt-1 text-sm text-[var(--mu-muted)]">{stat.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="mu-display text-2xl">Your listings</h2>
        {data.listings.length === 0 ? (
          <p className="mu-frame mu-sans mt-4 rounded-xl p-8 text-center text-[var(--mu-muted)]">
            Nothing listed yet.{" "}
            <Link className="text-[var(--mu-brass)]" href="/mintedup/sell">
              Create your first listing
            </Link>
            .
          </p>
        ) : (
          <div className="mu-sans mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--mu-line)] text-left">
                  {["Lot", "Category", "Format", "Price", "Status", ""].map((heading) => (
                    <th key={heading} className="mu-label pb-2">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.listings.map((listing) => {
                  const bid = currentBid(listing, data.bids);
                  return (
                    <tr key={listing.id} className="border-b border-[var(--mu-line)]">
                      <td className="py-3 pr-4">
                        <Link
                          className="text-[var(--mu-text)] hover:text-[var(--mu-brass)]"
                          href={
                            listing.status === "draft"
                              ? `/mintedup/sell?draft=${listing.id}`
                              : `/mintedup/listing/${listing.id}`
                          }
                        >
                          {listing.title || "Untitled listing"}
                        </Link>
                        <span className="block text-xs text-[var(--mu-muted)]">
                          {listing.images.length} photograph
                          {listing.images.length === 1 ? "" : "s"}
                          {listing.endsAt && listing.status === "active"
                            ? ` · ${timeLeft(listing.endsAt)} left`
                            : ""}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[var(--mu-muted)]">
                        {categoryName(listing.categoryId)}
                      </td>
                      <td className="py-3 pr-4 text-[var(--mu-muted)]">
                        {listing.format === "bid" ? "Bid it" : "Buy it"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--mu-brass)]">
                        {formatMoney(
                          listing.status === "sold" && listing.soldPrice
                            ? listing.soldPrice
                            : listing.format === "bid"
                              ? bid.amount
                              : listing.price,
                          listing.currency,
                        )}
                      </td>
                      <td className="py-3 pr-4 text-[var(--mu-muted)]">{listing.status}</td>
                      <td className="py-3 text-right">
                        <Link
                          className="text-xs text-[var(--mu-brass)]"
                          href={`/mintedup/sell?draft=${listing.id}`}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {watchedListings.length > 0 ? (
        <section className="mt-12">
          <h2 className="mu-display text-2xl">Lots you are bidding on</h2>
          <ul className="mu-sans mt-4 space-y-2">
            {watchedListings.map((listing) => {
              const bid = currentBid(listing, data.bids);
              const leading = bid.bidderId === user.id;
              return (
                <li key={listing.id}>
                  <Link
                    className="mu-frame flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
                    href={`/mintedup/listing/${listing.id}`}
                  >
                    <span className="mu-display text-base">{listing.title}</span>
                    <span className="text-sm">
                      <span className="text-[var(--mu-brass)]">
                        {formatMoney(bid.amount, listing.currency)}
                      </span>
                      <span
                        className={`ml-3 text-xs font-semibold ${
                          leading ? "text-[var(--mu-verdigris)]" : "text-[var(--mu-alert)]"
                        }`}
                      >
                        {listing.status === "sold"
                          ? leading
                            ? "Won"
                            : "Lost"
                          : leading
                            ? "Leading"
                            : "Outbid"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {data.purchases.length > 0 ? (
        <section className="mt-12">
          <h2 className="mu-display text-2xl">Bought</h2>
          <ul className="mu-sans mt-4 space-y-2 text-sm">
            {data.purchases.map((order) => (
              <li key={order.id} className="mu-frame rounded-xl px-4 py-3">
                <Link className="text-[var(--mu-text)]" href={`/mintedup/listing/${order.listingId}`}>
                  {formatMoney(order.amount)} · {formatDate(order.placedAt)} · {order.status}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.research.length > 0 ? (
        <section className="mt-12">
          <h2 className="mu-display text-2xl">Your research</h2>
          <ul className="mu-sans mt-4 space-y-2">
            {data.research.map((session) => (
              <li key={session.id} className="mu-frame rounded-xl px-4 py-3">
                <p className="mu-display text-base">{session.title}</p>
                <p className="text-xs text-[var(--mu-muted)]">
                  {session.signals.length} observation
                  {session.signals.length === 1 ? "" : "s"} · {session.queries.length} search
                  {session.queries.length === 1 ? "" : "es"} · updated{" "}
                  {formatDate(session.updatedAt)}
                </p>
                {session.signals.length > 0 ? (
                  <p className="mt-1 text-xs text-[var(--mu-muted)]">
                    {session.signals
                      .filter((s) => s.source !== "rejected")
                      .map((s) => `${s.type}: ${s.value}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
