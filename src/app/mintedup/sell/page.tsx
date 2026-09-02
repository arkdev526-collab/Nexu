import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/mintedup/auth";
import { AI_AVAILABLE } from "@/mintedup/ai";
import { CATEGORIES, categoryName, isValidCategory } from "@/mintedup/categories";
import { formatDate } from "@/mintedup/format";
import { PRICING } from "@/mintedup/billing";
import { createDraft } from "@/mintedup/listings";
import { checkQuota, isShopMember, listingAllowance } from "@/mintedup/membership";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";
import { ListingComposer } from "../_components/ListingComposer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create a listing" };

/** Start a new draft and drop the seller straight into the composer. */
async function startDraft(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/mintedup/signin");
  const categoryId = String(formData.get("categoryId") ?? "");
  const listing = await createDraft(user.id, isValidCategory(categoryId) ? categoryId : CATEGORIES[0].id);
  redirect(`/mintedup/sell?draft=${listing.id}`);
}

export default async function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  await ensureSeeded();
  const user = await currentUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-24 text-center sm:px-6">
        <h1 className="mu-display text-4xl">Sell on Minted Up</h1>
        <p className="mu-sans mt-4 text-[var(--mu-muted)]">
          You need a shop before you can list. It takes a minute and gives you the composer, the
          research gateway and your own shopfront.
        </p>
        <Link className="mu-btn mu-btn-primary mu-sans mt-8" href="/mintedup/signin?mode=register">
          Open a shop
        </Link>
      </div>
    );
  }

  const { draft: draftId } = await searchParams;

  if (draftId) {
    const listing = await read(
      (db) => db.listings.find((l) => l.id === draftId && l.sellerId === user.id) ?? null,
    );
    if (!listing) redirect("/mintedup/sell");

    const allowance = listingAllowance(user, PRICING.listingFee);
    const aiSeo = checkQuota(user, "aiSeo");
    const autocomplete = checkQuota(user, "autocomplete");

    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mu-sans text-xs uppercase tracking-[0.2em] text-[var(--mu-brass)]">
              {
                {
                  draft: "Draft",
                  submitted: "With the curation desk",
                  changes: "Changes requested",
                  rejected: "Not accepted",
                  approved: "Approved",
                  active: "Live in the catalogue",
                  sold: "Sold",
                  ended: "Ended",
                  removed: "Removed",
                }[listing.status]
              }
            </p>
            <h1 className="mu-display mt-2 text-4xl">
              {listing.title || "Untitled listing"}
            </h1>
            <p className="mu-sans mt-1 text-sm text-[var(--mu-muted)]">
              {categoryName(listing.categoryId)} · started {formatDate(listing.createdAt)}
            </p>
          </div>
          <Link className="mu-btn mu-btn-ghost mu-sans" href="/mintedup/dashboard">
            All my listings
          </Link>
        </div>

        {!AI_AVAILABLE() ? (
          <p className="mu-sans mb-6 rounded-lg border border-[var(--mu-line)] bg-[var(--mu-surface)] px-4 py-3 text-sm text-[var(--mu-muted)]">
            No <code className="text-[var(--mu-brass)]">ANTHROPIC_API_KEY</code> is configured, so
            the AI SEO buttons and auto-complete fall back to a local generator built from the
            fields you fill in. Everything else works as normal.
          </p>
        ) : null}

        <ListingComposer
          listing={listing}
          context={{
            feeReason: allowance.reason,
            fee: allowance.fee,
            freeListingsRemaining: user.freeListingsRemaining,
            isShopMember: isShopMember(user),
            aiSeoRemaining: aiSeo.remaining,
            autocompleteRemaining: autocomplete.remaining,
            curationNotes: listing.curation.notes,
            changesRequested: listing.curation.changesRequested,
            status: listing.status,
          }}
        />
      </div>
    );
  }

  const drafts = await read((db) =>
    db.listings
      .filter((l) =>
        ["draft", "submitted", "changes", "rejected", "active"].includes(l.status),
      )
      .filter((l) => l.sellerId === user.id)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-6 lg:px-8">
      <h1 className="mu-display text-4xl">Create a listing</h1>
      <p className="mu-sans mt-3 max-w-2xl text-[var(--mu-muted)]">
        Choose the category first — it decides which research prompts, comparable sales and buyer
        expectations the composer works from.
      </p>

      <p className="mu-sans mt-4 rounded-lg border border-[var(--mu-line)] bg-[var(--mu-surface)] px-4 py-3 text-sm text-[var(--mu-muted)]">
        {isShopMember(user)
          ? "Shop member — unlimited listings, no listing fee. Commission is 1% of the sale value."
          : `${user.freeListingsRemaining} of your five free listings left. After that it is ${PRICING.listingFee}p a listing, plus 1% of the sale value. `}
        {isShopMember(user) ? null : (
          <Link className="text-[var(--mu-brass)] hover:underline" href="/mintedup/membership">
            Open a shop for £20 a month
          </Link>
        )}
      </p>

      <form action={startDraft} className="mu-sans mt-8 flex flex-wrap items-end gap-3">
        <div className="min-w-[18rem] flex-1">
          <label className="mu-label" htmlFor="categoryId">
            Category
          </label>
          <select className="mu-input" id="categoryId" name="categoryId" defaultValue={CATEGORIES[0].id}>
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <button className="mu-btn mu-btn-primary" type="submit">
          Start the listing
        </button>
      </form>

      {drafts.length > 0 ? (
        <section className="mt-12">
          <h2 className="mu-display text-2xl">Pick up where you left off</h2>
          <ul className="mu-sans mt-4 space-y-2">
            {drafts.map((listing) => (
              <li key={listing.id}>
                <Link
                  className="mu-frame flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 transition"
                  href={`/mintedup/sell?draft=${listing.id}`}
                >
                  <span>
                    <span className="mu-display block text-base">
                      {listing.title || "Untitled listing"}
                    </span>
                    <span className="text-xs text-[var(--mu-muted)]">
                      {categoryName(listing.categoryId)} · {listing.images.length} photograph
                      {listing.images.length === 1 ? "" : "s"} · updated{" "}
                      {formatDate(listing.updatedAt)}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] ${
                      listing.status === "draft"
                        ? "bg-[rgba(216,180,90,0.16)] text-[var(--mu-brass)]"
                        : "bg-[rgba(79,155,134,0.16)] text-[var(--mu-verdigris)]"
                    }`}
                  >
                    {listing.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
