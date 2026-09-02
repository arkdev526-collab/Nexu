import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/mintedup/auth";
import { CATEGORIES, categoryName } from "@/mintedup/categories";
import { formatDate, formatMoney, parseMoney } from "@/mintedup/format";
import { EVENT_WEIGHTS, learningStats } from "@/mintedup/research";
import { ensureSeeded } from "@/mintedup/seed";
import { mutate, newId, read } from "@/mintedup/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

async function requireAdmin() {
  const user = await currentUser();
  if (!user) redirect("/mintedup/signin");
  if (user.role !== "admin") redirect("/mintedup/dashboard");
  return user;
}

async function setUserState(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const action = String(formData.get("action") ?? "");
  await mutate((db) => {
    const target = db.users.find((u) => u.id === userId);
    if (!target) return;
    if (action === "suspend") target.suspended = true;
    if (action === "restore") target.suspended = false;
    if (action === "promote") target.role = "admin";
    if (action === "demote") target.role = "user";
  });
  revalidatePath("/mintedup/admin");
}

async function removeListing(formData: FormData) {
  "use server";
  await requireAdmin();
  const listingId = String(formData.get("listingId") ?? "");
  await mutate((db) => {
    const listing = db.listings.find((l) => l.id === listingId);
    if (listing) {
      listing.status = "removed";
      listing.updatedAt = new Date().toISOString();
    }
  });
  revalidatePath("/mintedup/admin");
}

/**
 * Add a curated document to the reference tier. Reference material outranks
 * community contributions in retrieval, which is how a documented fact keeps
 * beating a popular wrong answer.
 */
async function addReferenceDoc(formData: FormData) {
  "use server";
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? CATEGORIES[0].id);
  const terms = String(formData.get("terms") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const realised = parseMoney(String(formData.get("realisedPrice") ?? ""));
  if (!title || !body) return;

  await mutate((db) => {
    db.researchDocs.push({
      id: newId("doc"),
      tier: realised > 0 ? "market" : "reference",
      title,
      body,
      categoryId,
      terms,
      realisedPrice: realised > 0 ? realised : null,
      currency: realised > 0 ? "GBP" : null,
      sourceListingId: null,
      contributedBy: null,
      weight: 3,
      createdAt: new Date().toISOString(),
    });
  });
  revalidatePath("/mintedup/admin");
}

async function deleteDoc(formData: FormData) {
  "use server";
  await requireAdmin();
  const docId = String(formData.get("docId") ?? "");
  await mutate((db) => {
    db.researchDocs = db.researchDocs.filter((d) => d.id !== docId);
  });
  revalidatePath("/mintedup/admin");
}

export default async function AdminPage() {
  await ensureSeeded();
  await requireAdmin();

  const data = await read((db) => ({
    users: db.users,
    listings: db.listings,
    orders: db.orders,
    docs: [...db.researchDocs].sort((a, b) => b.weight - a.weight),
    sessions: db.researchSessions.length,
  }));
  const stats = await learningStats();

  const gross = data.orders.reduce((sum, order) => sum + order.amount, 0);
  const flagged = data.docs.filter((d) => d.tier === "community" && d.weight < -1);

  const tiles = [
    { label: "Sellers", value: String(data.users.length) },
    { label: "Live listings", value: String(data.listings.filter((l) => l.status === "active").length) },
    { label: "Orders", value: String(data.orders.length) },
    { label: "Gross merchandise", value: formatMoney(gross) },
    { label: "Corpus documents", value: String(stats.corpusSize) },
    { label: "Learning signals", value: String(stats.events) },
    { label: "Research sessions", value: String(data.sessions) },
    { label: "Realised prices", value: String(stats.pricedComparables) },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
      <h1 className="mu-display text-4xl">Minted Up administration</h1>
      <p className="mu-sans mt-2 text-[var(--mu-muted)]">
        Marketplace state, seller accounts and the research corpus the gateway learns from.
      </p>

      <div className="mu-sans mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="mu-frame rounded-xl p-5">
            <p className="mu-display text-2xl text-[var(--mu-brass)]">{tile.value}</p>
            <p className="mt-1 text-sm text-[var(--mu-muted)]">{tile.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="mu-display text-2xl">Learning signals by kind</h2>
        <p className="mu-sans mt-1 text-sm text-[var(--mu-muted)]">
          Every interaction is logged with a weight. The market&rsquo;s verdict outweighs a search
          by fifty to one, which is what stops the corpus drifting toward whatever is popular.
        </p>
        <div className="mu-sans mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--mu-line)] text-left">
                <th className="mu-label pb-2">Signal</th>
                <th className="mu-label pb-2">Weight</th>
                <th className="mu-label pb-2">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(EVENT_WEIGHTS).map(([kind, weight]) => (
                <tr key={kind} className="border-b border-[var(--mu-line)]">
                  <td className="py-2 text-[var(--mu-text)]">{kind.replace(/_/g, " ")}</td>
                  <td className="py-2 text-[var(--mu-brass)]">{weight}</td>
                  <td className="py-2 text-[var(--mu-muted)]">{stats.byKind[kind] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stats.topTerms.length > 0 ? (
          <p className="mu-sans mt-4 text-sm text-[var(--mu-muted)]">
            Most indexed terms: {stats.topTerms.map((t) => `${t.term} (${t.docs})`).join(", ")}
          </p>
        ) : null}
      </section>

      <section className="mt-12">
        <h2 className="mu-display text-2xl">Sellers</h2>
        <div className="mu-sans mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--mu-line)] text-left">
                {["Shop", "Email", "Role", "Joined", "Listings", ""].map((h) => (
                  <th key={h} className="mu-label pb-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.users.map((seller) => (
                <tr key={seller.id} className="border-b border-[var(--mu-line)]">
                  <td className="py-3 pr-4">
                    <Link
                      className="text-[var(--mu-text)] hover:text-[var(--mu-brass)]"
                      href={`/mintedup/shop/${seller.shop.slug}`}
                    >
                      {seller.shop.name}
                    </Link>
                    {seller.suspended ? (
                      <span className="ml-2 text-xs text-[var(--mu-alert)]">suspended</span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-[var(--mu-muted)]">{seller.email}</td>
                  <td className="py-3 pr-4 text-[var(--mu-muted)]">{seller.role}</td>
                  <td className="py-3 pr-4 text-[var(--mu-muted)]">{formatDate(seller.createdAt)}</td>
                  <td className="py-3 pr-4 text-[var(--mu-muted)]">
                    {data.listings.filter((l) => l.sellerId === seller.id).length}
                  </td>
                  <td className="py-3">
                    <form action={setUserState} className="flex gap-2">
                      <input type="hidden" name="userId" value={seller.id} />
                      <button
                        className="text-xs text-[var(--mu-brass)]"
                        name="action"
                        value={seller.suspended ? "restore" : "suspend"}
                        type="submit"
                      >
                        {seller.suspended ? "Restore" : "Suspend"}
                      </button>
                      <button
                        className="text-xs text-[var(--mu-muted)]"
                        name="action"
                        value={seller.role === "admin" ? "demote" : "promote"}
                        type="submit"
                      >
                        {seller.role === "admin" ? "Demote" : "Make admin"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mu-display text-2xl">Listings</h2>
        <div className="mu-sans mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--mu-line)] text-left">
                {["Lot", "Category", "Status", "Images", "AI fields", ""].map((h) => (
                  <th key={h} className="mu-label pb-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.listings.slice(0, 40).map((listing) => (
                <tr key={listing.id} className="border-b border-[var(--mu-line)]">
                  <td className="py-3 pr-4">
                    <Link
                      className="text-[var(--mu-text)] hover:text-[var(--mu-brass)]"
                      href={`/mintedup/listing/${listing.id}`}
                    >
                      {listing.title || "Untitled"}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-[var(--mu-muted)]">
                    {categoryName(listing.categoryId)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--mu-muted)]">{listing.status}</td>
                  <td className="py-3 pr-4 text-[var(--mu-muted)]">
                    {listing.images.length}
                    {listing.images.length > 0
                      ? ` · avg ${Math.round(
                          listing.images.reduce((s, i) => s + i.quality.score, 0) /
                            listing.images.length,
                        )}/100`
                      : ""}
                  </td>
                  <td className="py-3 pr-4 text-[var(--mu-muted)]">
                    {listing.seo.aiAssistedFields.join(", ") || "—"}
                  </td>
                  <td className="py-3">
                    {listing.status !== "removed" ? (
                      <form action={removeListing}>
                        <input type="hidden" name="listingId" value={listing.id} />
                        <button className="text-xs text-[var(--mu-alert)]" type="submit">
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div>
          <h2 className="mu-display text-2xl">Research corpus</h2>
          <p className="mu-sans mt-1 text-sm text-[var(--mu-muted)]">
            Ordered by accumulated feedback weight. Community documents that sellers keep marking
            &ldquo;not mine&rdquo; sink to the bottom and are flagged for review.
          </p>
          {flagged.length > 0 ? (
            <p className="mu-sans mt-3 rounded-lg border border-[var(--mu-alert)] bg-[rgba(224,118,78,0.08)] px-4 py-2 text-sm text-[var(--mu-alert)]">
              {flagged.length} community document{flagged.length === 1 ? "" : "s"} below the
              rejection threshold — review before they mislead anyone.
            </p>
          ) : null}
          <div className="mu-sans mt-4 max-h-[36rem] space-y-2 overflow-y-auto pr-2">
            {data.docs.map((doc) => (
              <div key={doc.id} className="mu-frame rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="mu-display text-base">{doc.title}</span>
                  <span className="flex items-center gap-3 text-xs">
                    <span
                      className={
                        doc.tier === "reference"
                          ? "text-[var(--mu-brass)]"
                          : doc.tier === "market"
                            ? "text-[var(--mu-verdigris)]"
                            : "text-[var(--mu-muted)]"
                      }
                    >
                      {doc.tier}
                    </span>
                    <span className={doc.weight < 0 ? "text-[var(--mu-alert)]" : "text-[var(--mu-muted)]"}>
                      weight {doc.weight}
                    </span>
                    <form action={deleteDoc}>
                      <input type="hidden" name="docId" value={doc.id} />
                      <button className="text-[var(--mu-alert)]" type="submit">
                        Delete
                      </button>
                    </form>
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--mu-muted)]">
                  {categoryName(doc.categoryId)}
                  {doc.realisedPrice ? ` · realised ${formatMoney(doc.realisedPrice)}` : ""} ·{" "}
                  {doc.terms.slice(0, 6).join(", ")}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mu-frame h-fit rounded-xl p-5">
          <h3 className="mu-display text-lg">Add to the corpus</h3>
          <p className="mu-sans mt-1 text-xs text-[var(--mu-muted)]">
            Leave the price empty for a reference note. Enter one to record a comparable sale, which
            feeds price guidance directly.
          </p>
          <form action={addReferenceDoc} className="mu-sans mt-4 space-y-3">
            <div>
              <label className="mu-label" htmlFor="doc-title">
                Title
              </label>
              <input className="mu-input" id="doc-title" name="title" required />
            </div>
            <div>
              <label className="mu-label" htmlFor="doc-category">
                Category
              </label>
              <select className="mu-input" id="doc-category" name="categoryId">
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mu-label" htmlFor="doc-terms">
                Typed terms
              </label>
              <input
                className="mu-input"
                id="doc-terms"
                name="terms"
                placeholder="mark:anchor, material:sterling silver, period:victorian"
              />
              <p className="mt-1 text-xs text-[var(--mu-muted)]">
                Comma separated, prefixed with the attribute type — this is what makes a term
                suggestable in the composer.
              </p>
            </div>
            <div>
              <label className="mu-label" htmlFor="doc-price">
                Realised price (£, optional)
              </label>
              <input className="mu-input" id="doc-price" name="realisedPrice" inputMode="decimal" />
            </div>
            <div>
              <label className="mu-label" htmlFor="doc-body">
                Body
              </label>
              <textarea className="mu-input min-h-32" id="doc-body" name="body" required />
            </div>
            <button className="mu-btn mu-btn-primary w-full" type="submit">
              Add document
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
