import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/mintedup/auth";
import { categoryName, getCategory } from "@/mintedup/categories";
import { formatDate, formatMoney, timeLeft } from "@/mintedup/format";
import {
  currentBid,
  extensionSeconds,
  isLive,
  minimumBid,
  settleDueAuctions,
} from "@/mintedup/listings";
import { refreshAuctionStatuses } from "@/mintedup/curation";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";
import { Gallery } from "../../_components/Gallery";
import { SalePanel } from "../../_components/SalePanel";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const listing = await read((db) => db.listings.find((l) => l.id === id) ?? null);
  if (!listing) return { title: "Lot not found" };
  return {
    title: listing.seo.metaTitle || listing.title,
    description: listing.seo.metaDescription || listing.subtitle,
    keywords: listing.seo.keywords,
  };
}

export default async function ListingPage({ params }: Params) {
  await ensureSeeded();
  await refreshAuctionStatuses();
  await settleDueAuctions();
  const { id } = await params;

  const data = await read((db) => {
    const listing = db.listings.find((l) => l.id === id);
    if (!listing) return null;
    return {
      listing,
      seller: db.users.find((u) => u.id === listing.sellerId) ?? null,
      bids: db.bids.filter((b) => b.listingId === listing.id && !b.retracted),
      related: db.listings
        .filter((l) => l.id !== listing.id && l.categoryId === listing.categoryId && l.status === "active")
        .slice(0, 3),
      auction: listing.auctionId
        ? (db.auctions.find((a) => a.id === listing.auctionId) ?? null)
        : null,
    };
  });

  if (!data || data.listing.status === "removed") notFound();
  const { listing, seller, bids, related, auction } = data;
  const viewer = await currentUser();
  const bid = currentBid(listing, bids);
  const category = getCategory(listing.categoryId);

  const attributeRows: [string, string][] = [
    ["Maker or attribution", listing.attributes.maker],
    ["Period", listing.attributes.period],
    ["Origin", listing.attributes.origin],
    ["Materials", listing.attributes.materials.join(", ")],
    ["Marks", listing.attributes.marks],
    ["Dimensions", listing.attributes.dimensions],
    ["Condition grade", listing.attributes.conditionGrade.replace("-", " ")],
    ["Provenance", listing.attributes.provenance],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
      <nav className="mu-sans mb-6 text-sm text-[var(--mu-muted)]">
        <Link className="hover:text-[var(--mu-brass)]" href="/mintedup/browse">
          Catalogue
        </Link>
        <span className="px-2">/</span>
        <Link
          className="hover:text-[var(--mu-brass)]"
          href={`/mintedup/browse?category=${listing.categoryId}`}
        >
          {categoryName(listing.categoryId)}
        </Link>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Gallery images={listing.images} title={listing.title} />

          <div className="mt-10">
            <h2 className="mu-display text-2xl">Description</h2>
            <div className="mu-sans mt-3 space-y-4 leading-relaxed text-[var(--mu-muted)]">
              {listing.description.split("\n\n").map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>

          {listing.attributes.condition ? (
            <div className="mu-frame mt-8 rounded-xl p-5">
              <h3 className="mu-display text-lg">Condition report</h3>
              <p className="mu-sans mt-2 leading-relaxed text-[var(--mu-muted)]">
                {listing.attributes.condition}
              </p>
              {listing.attributes.restored ? (
                <p className="mu-sans mt-2 text-sm text-[var(--mu-alert)]">
                  The seller has declared restoration on this lot.
                </p>
              ) : null}
            </div>
          ) : null}

          {attributeRows.length > 0 ? (
            <div className="mt-8">
              <h3 className="mu-display text-lg">The object</h3>
              <dl className="mu-sans mt-3 divide-y divide-[var(--mu-line)] border-y border-[var(--mu-line)]">
                {attributeRows.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[10rem_1fr] gap-4 py-2.5 text-sm">
                    <dt className="text-[var(--mu-muted)]">{label}</dt>
                    <dd className="text-[var(--mu-text)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {category ? (
            <div className="mu-frame mt-8 rounded-xl p-5">
              <p className="mu-label">Research it</p>
              <p className="mu-sans text-sm leading-relaxed text-[var(--mu-muted)]">
                Buying in {category.name}? Collectors check: {category.researchPrompts.join("; ")}.
              </p>
              <Link
                className="mu-btn mu-btn-ghost mu-sans mt-4"
                href={`/mintedup/research?q=${encodeURIComponent(
                  [listing.attributes.maker, listing.attributes.period, listing.title]
                    .filter(Boolean)
                    .join(" "),
                )}&category=${listing.categoryId}`}
              >
                Research this object
              </Link>
            </div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="mu-frame rounded-xl p-6">
            <p className="mu-sans text-xs uppercase tracking-[0.16em] text-[var(--mu-brass)]">
              {listing.format === "bid" ? "Bid it — curated auction" : "Buy it — fixed price"}
            </p>
            {auction ? (
              <Link
                className="mu-sans mt-2 inline-block text-sm text-[var(--mu-verdigris)] hover:underline"
                href={`/mintedup/sales/${auction.id}`}
              >
                Part of {auction.title}
              </Link>
            ) : null}
            <h1 className="mu-display mt-3 text-3xl leading-tight">{listing.title}</h1>
            {listing.subtitle ? (
              <p className="mu-sans mt-2 text-[var(--mu-muted)]">{listing.subtitle}</p>
            ) : null}

            <hr className="mu-rule my-5" />

            {listing.status === "sold" ? (
              <p className="mu-sans rounded-lg border border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.1)] px-4 py-3 text-sm text-[var(--mu-verdigris)]">
                Sold {listing.soldPrice ? `for ${formatMoney(listing.soldPrice, listing.currency)}` : ""}
                {listing.soldAt ? ` on ${formatDate(listing.soldAt)}` : ""}.
              </p>
            ) : (
              <>
                {listing.format === "bid" ? (
                  <div className="mu-sans mb-4">
                    <p className="mu-display text-3xl text-[var(--mu-brass)]">
                      {formatMoney(bid.amount, listing.currency)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--mu-muted)]">
                      {bid.count} bid{bid.count === 1 ? "" : "s"}
                      {listing.endsAt ? ` · ${timeLeft(listing.endsAt)} left` : ""}
                      {listing.reserve > 0
                        ? bid.amount >= listing.reserve
                          ? " · reserve met"
                          : " · reserve not yet met"
                        : ""}
                    </p>
                  </div>
                ) : null}

                <SalePanel
                  listingId={listing.id}
                  format={listing.format}
                  price={listing.price}
                  currency={listing.currency}
                  minimumBid={minimumBid(listing, bids)}
                  signedIn={Boolean(viewer)}
                  isOwner={viewer?.id === listing.sellerId}
                  live={isLive(listing)}
                  endsAt={listing.endsAt}
                  nextExtensionSeconds={extensionSeconds(listing.extensions)}
                />
              </>
            )}

            {listing.curation.decidedAt ? (
              <>
                <hr className="mu-rule my-5" />
                <div className="mu-sans rounded-lg border border-[var(--mu-line)] px-3 py-2">
                  <p className="mu-label mb-1 text-[var(--mu-verdigris)]">Curated lot</p>
                  <p className="text-xs leading-relaxed text-[var(--mu-muted)]">
                    A Minted Up curator read this lot against its photographs before it was
                    catalogued.
                    {listing.curation.notes ? ` “${listing.curation.notes}”` : ""}
                  </p>
                </div>
              </>
            ) : null}

            <hr className="mu-rule my-5" />

            <div className="mu-sans text-sm text-[var(--mu-muted)]">
              <p className="mu-label">Shipping</p>
              {listing.shipping.collectionOnly ? (
                <p>Collection only.</p>
              ) : (
                <p>
                  {formatMoney(listing.shipping.domestic, listing.currency)} domestic ·{" "}
                  {formatMoney(listing.shipping.international, listing.currency)} international
                </p>
              )}
            </div>

            {seller ? (
              <>
                <hr className="mu-rule my-5" />
                <div className="mu-sans">
                  <p className="mu-label">Sold by</p>
                  <Link
                    className="mu-display text-lg text-[var(--mu-text)] hover:text-[var(--mu-brass)]"
                    href={`/mintedup/shop/${seller.shop.slug}`}
                  >
                    {seller.shop.name}
                  </Link>
                  {seller.shop.location ? (
                    <p className="text-sm text-[var(--mu-muted)]">{seller.shop.location}</p>
                  ) : null}
                  {seller.shop.returnsPolicy ? (
                    <p className="mt-2 text-xs text-[var(--mu-muted)]">{seller.shop.returnsPolicy}</p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-16">
          <h2 className="mu-display mb-5 text-2xl">More in {categoryName(listing.categoryId)}</h2>
          <div className="mu-sans grid gap-4 sm:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/mintedup/listing/${item.id}`}
                className="mu-frame rounded-xl p-4"
              >
                <p className="mu-display text-base">{item.title}</p>
                <p className="mt-1 text-sm text-[var(--mu-brass)]">
                  {formatMoney(item.format === "bid" ? item.startingBid : item.price, item.currency)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
