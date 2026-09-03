import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canCurate, currentUser, requireRole } from "@/mintedup/auth";
import { CATEGORIES, categoryName } from "@/mintedup/categories";
import { formatDate, formatMoney, parseMoney } from "@/mintedup/format";
import { ensureSeeded } from "@/mintedup/seed";
import {
  createSourceRecord,
  listSourceRecords,
  reviewSourceRecord,
  sourceLibraryStats,
  type SourceRecordInput,
} from "@/mintedup/source-library";
import { ensureVerifiedSourceSeeds } from "@/mintedup/source-seeds";
import type { ResearchSourceType, SourceRecordKind } from "@/mintedup/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Source Library" };

const KINDS: { value: SourceRecordKind; label: string }[] = [
  { value: "museum-object", label: "Museum object" },
  { value: "institutional-catalogue", label: "Institutional catalogue" },
  { value: "auction-lot", label: "Auction lot" },
  { value: "dealer-listing", label: "Dealer listing" },
  { value: "marketplace-sale", label: "Marketplace sale" },
];
const SOURCE_TYPES: { value: ResearchSourceType; label: string }[] = [
  { value: "museum", label: "Museum" },
  { value: "institution", label: "Institution" },
  { value: "auction-house", label: "Auction house" },
  { value: "dealer", label: "Dealer" },
  { value: "marketplace", label: "Marketplace" },
  { value: "seller", label: "Seller/community" },
];

async function requireCuratorPage() {
  const user = await currentUser();
  if (!user) redirect("/mintedup/signin");
  if (!canCurate(user)) redirect("/mintedup/dashboard");
  return user;
}

function money(formData: FormData, key: string): number | null {
  const value = parseMoney(String(formData.get(key) ?? ""));
  return value > 0 ? value : null;
}

function bps(formData: FormData, key: string): number | null {
  const value = Number(String(formData.get(key) ?? "").trim());
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

async function addSource(formData: FormData) {
  "use server";
  const curator = await requireRole("curator");
  const kind = String(formData.get("kind") ?? "museum-object") as SourceRecordKind;
  const sourceType = String(formData.get("sourceType") ?? "institution") as ResearchSourceType;
  const terms = String(formData.get("terms") ?? "")
    .split(/[\n,]+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const currency = ["GBP", "USD", "EUR"].includes(String(formData.get("currency")))
    ? (String(formData.get("currency")) as "GBP" | "USD" | "EUR")
    : null;

  const input: SourceRecordInput = {
    kind,
    sourceType,
    sourceName: String(formData.get("sourceName") ?? ""),
    sourceUrl: String(formData.get("sourceUrl") ?? ""),
    sourceRecord: String(formData.get("sourceRecord") ?? ""),
    categoryId: String(formData.get("categoryId") ?? CATEGORIES[0].id),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    terms,
    dimensions: String(formData.get("dimensions") ?? ""),
    condition: String(formData.get("condition") ?? ""),
    provenance: String(formData.get("provenance") ?? ""),
    currency,
    realisedPrice: money(formData, "realisedPrice"),
    askingPrice: money(formData, "askingPrice"),
    snapshotTitle: String(formData.get("snapshotTitle") ?? ""),
    snapshotExcerpt: String(formData.get("snapshotExcerpt") ?? ""),
    observedAt: String(formData.get("observedAt") ?? "") || null,
    auction: kind === "auction-lot" ? {
      saleName: String(formData.get("saleName") ?? ""),
      saleDate: String(formData.get("saleDate") ?? "") || null,
      lotNumber: String(formData.get("lotNumber") ?? "") || null,
      estimateLow: money(formData, "estimateLow"),
      estimateHigh: money(formData, "estimateHigh"),
      hammerPrice: money(formData, "hammerPrice"),
      buyerPremiumAmount: money(formData, "buyerPremiumAmount"),
      buyerPremiumRateBps: bps(formData, "buyerPremiumRate"),
      buyerTotalPrice: money(formData, "buyerTotalPrice"),
      currency,
      sold: formData.get("sold") === "on" ? true : null,
      priceNote: String(formData.get("priceNote") ?? ""),
    } : null,
  };
  await createSourceRecord(input, curator.id);
  revalidatePath("/mintedup/admin/sources");
}

async function decideSource(formData: FormData) {
  "use server";
  const curator = await requireRole("curator");
  const id = String(formData.get("sourceId") ?? "");
  const decision = String(formData.get("decision")) === "reject" ? "reject" : "verify";
  await reviewSourceRecord(id, decision, curator.id);
  revalidatePath("/mintedup/admin/sources");
  revalidatePath("/mintedup/research");
}

export default async function SourceLibraryPage() {
  await ensureSeeded();
  await ensureVerifiedSourceSeeds();
  await requireCuratorPage();
  const [records, stats] = await Promise.all([listSourceRecords(), sourceLibraryStats()]);

  const tiles = [
    ["Source records", stats.total],
    ["Verified", stats.verified],
    ["Draft review", stats.drafts],
    ["Auction lots", stats.auctionLots],
    ["Museum / institution", stats.institutions],
    ["Buyer-total sales", stats.realisedBuyerTotals],
  ] as const;

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">Auction Intelligence</p>
          <h1 className="mu-display mt-2 text-4xl">Source Library</h1>
          <p className="mu-sans mt-3 leading-relaxed text-[var(--mu-muted)]">
            Primary-source evidence enters Research v2 here. Imports stay draft until a curator verifies the official record. Exact duplicates are idempotent; probable duplicates are flagged before review.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="mu-btn mu-btn-ghost mu-sans" href="/mintedup/research">Open Research v2</Link>
          <Link className="mu-btn mu-btn-primary mu-sans" href="/mintedup/admin">Admin</Link>
        </div>
      </div>

      <div className="mu-sans mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="mu-frame rounded-xl p-4">
            <p className="mu-display text-2xl text-[var(--mu-brass)]">{value}</p>
            <p className="mt-1 text-xs text-[var(--mu-muted)]">{label}</p>
          </div>
        ))}
      </div>

      <section className="mt-10 grid gap-8 lg:grid-cols-[24rem_1fr]">
        <div className="mu-frame h-fit rounded-xl p-5 lg:sticky lg:top-24">
          <h2 className="mu-display text-xl">Import evidence</h2>
          <p className="mu-sans mt-1 text-xs leading-relaxed text-[var(--mu-muted)]">
            Paste factual metadata and a short editorial snapshot. Minted Up does not fetch arbitrary URLs server-side, avoiding an SSRF/crawler boundary in the web app.
          </p>
          <form action={addSource} className="mu-sans mt-5 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select className="mu-input" name="kind" defaultValue="museum-object">{KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              <select className="mu-input" name="sourceType" defaultValue="museum">{SOURCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            </div>
            <select className="mu-input" name="categoryId" defaultValue="ceramics-porcelain">{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <input className="mu-input" name="sourceName" placeholder="Source name — e.g. Christie's" required />
            <input className="mu-input" name="sourceUrl" type="url" placeholder="Official source URL" required />
            <input className="mu-input" name="sourceRecord" placeholder="Object / sale / lot identifier" />
            <input className="mu-input" name="title" placeholder="Object or lot title" required />
            <textarea className="mu-input min-h-24" name="description" placeholder="Factual evidence description" required />
            <textarea className="mu-input min-h-20" name="terms" placeholder="Typed evidence: form:vase, material:porcelain, mark:..." />
            <input className="mu-input" name="dimensions" placeholder="Dimensions / weight" />
            <textarea className="mu-input min-h-16" name="condition" placeholder="Condition evidence" />
            <textarea className="mu-input min-h-16" name="provenance" placeholder="Provenance evidence" />

            <div className="rounded-lg border border-[var(--mu-line)] p-3">
              <p className="mu-label">Price / auction evidence</p>
              <div className="grid grid-cols-2 gap-2">
                <select className="mu-input" name="currency" defaultValue="GBP"><option>GBP</option><option>USD</option><option>EUR</option></select>
                <input className="mu-input" name="realisedPrice" inputMode="decimal" placeholder="Marketplace realised" />
                <input className="mu-input" name="askingPrice" inputMode="decimal" placeholder="Asking price" />
                <input className="mu-input" name="saleName" placeholder="Sale name" />
                <input className="mu-input" name="saleDate" type="date" />
                <input className="mu-input" name="lotNumber" placeholder="Lot number" />
                <input className="mu-input" name="estimateLow" inputMode="decimal" placeholder="Estimate low" />
                <input className="mu-input" name="estimateHigh" inputMode="decimal" placeholder="Estimate high" />
                <input className="mu-input" name="hammerPrice" inputMode="decimal" placeholder="Hammer price" />
                <input className="mu-input" name="buyerPremiumRate" inputMode="decimal" placeholder="Premium %" />
                <input className="mu-input" name="buyerPremiumAmount" inputMode="decimal" placeholder="Premium amount" />
                <input className="mu-input" name="buyerTotalPrice" inputMode="decimal" placeholder="Buyer total incl. premium" />
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-[var(--mu-muted)]"><input type="checkbox" name="sold" /> Sold / price realised</label>
              <textarea className="mu-input mt-2 min-h-16" name="priceNote" placeholder="What exactly does the source say about hammer / premium / realised price?" />
            </div>

            <input className="mu-input" name="snapshotTitle" placeholder="Snapshot label" />
            <textarea className="mu-input min-h-20" name="snapshotExcerpt" placeholder="Short curator-written evidence snapshot / source note" />
            <input className="mu-input" name="observedAt" type="datetime-local" />
            <button className="mu-btn mu-btn-primary w-full" type="submit">Add to review queue</button>
          </form>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="mu-display text-2xl">Evidence records</h2>
              <p className="mu-sans mt-1 text-sm text-[var(--mu-muted)]">Verified records are synchronised into the Research v2 corpus. Rejection removes their derived research document.</p>
            </div>
            {stats.probableDuplicates > 0 ? <span className="mu-sans text-xs text-[var(--mu-alert)]">{stats.probableDuplicates} duplicate flags</span> : null}
          </div>

          <div className="mt-4 space-y-4">
            {records.map((record) => {
              const blockingDuplicate = record.duplicates.find((candidate) => candidate.verified && candidate.score === 1);
              return (
                <article key={record.id} className="mu-frame rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--mu-muted)]">{record.sourceType.replace(/-/g, " ")}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] ${record.reviewStatus === "verified" ? "bg-[rgba(79,155,134,0.14)] text-[var(--mu-verdigris)]" : record.reviewStatus === "rejected" ? "bg-[rgba(180,70,70,0.12)] text-[var(--mu-alert)]" : "bg-[rgba(216,180,90,0.12)] text-[var(--mu-brass)]"}`}>{record.reviewStatus}</span>
                        <span className="text-xs text-[var(--mu-muted)]">{categoryName(record.categoryId)}</span>
                      </div>
                      <h3 className="mu-display mt-2 text-lg">{record.title}</h3>
                      <p className="mu-sans mt-1 text-xs text-[var(--mu-muted)]">{record.sourceName}{record.sourceRecord ? ` · ${record.sourceRecord}` : ""} · updated {formatDate(record.updatedAt)}</p>
                      <a className="mu-sans mt-1 inline-block text-xs text-[var(--mu-brass)] hover:underline" href={record.sourceUrl} target="_blank" rel="noreferrer">Open primary source</a>
                    </div>
                    <div className="text-right">
                      {record.realisedPrice && record.currency ? <p className="mu-display text-lg text-[var(--mu-brass)]">{formatMoney(record.realisedPrice, record.currency)}</p> : record.auction?.hammerPrice && record.auction.currency ? <><p className="mu-display text-lg text-[var(--mu-text)]">{formatMoney(record.auction.hammerPrice, record.auction.currency)}</p><p className="mu-sans text-[0.65rem] text-[var(--mu-muted)]">hammer only · excluded from buyer-total value</p></> : null}
                      {record.auction?.lotNumber ? <p className="mu-sans text-xs text-[var(--mu-muted)]">Lot {record.auction.lotNumber}</p> : null}
                    </div>
                  </div>

                  <p className="mu-sans mt-3 text-sm leading-relaxed text-[var(--mu-muted)]">{record.description}</p>
                  {record.terms.length ? <p className="mu-sans mt-2 text-xs text-[var(--mu-muted)]">Evidence: {record.terms.slice(0, 10).join(" · ")}</p> : null}
                  {record.snapshot ? <div className="mu-sans mt-3 rounded-lg border border-[var(--mu-line)] p-3 text-xs text-[var(--mu-muted)]"><p>{record.snapshot.excerpt || "Snapshot metadata recorded."}</p><p className="mt-1 opacity-70">Snapshot SHA-256 {record.snapshot.contentHash.slice(0, 16)}…</p></div> : null}

                  {record.duplicates.length > 0 ? <div className="mu-sans mt-3 rounded-lg border border-[rgba(180,70,70,0.35)] p-3 text-xs text-[var(--mu-alert)]"><strong>Possible duplicate:</strong> {record.duplicates.map((candidate) => `${candidate.title} (${Math.round(candidate.score * 100)}%: ${candidate.reasons.join(", ")})`).join("; ")}</div> : null}

                  {record.reviewStatus === "draft" ? (
                    <form action={decideSource} className="mu-sans mt-4 flex flex-wrap gap-2">
                      <input type="hidden" name="sourceId" value={record.id} />
                      <button className="mu-btn mu-btn-primary !min-h-9 !text-xs" type="submit" name="decision" value="verify" disabled={Boolean(blockingDuplicate)}>{blockingDuplicate ? "Duplicate already verified" : "Verify & publish to Research"}</button>
                      <button className="mu-btn mu-btn-ghost !min-h-9 !text-xs" type="submit" name="decision" value="reject">Reject</button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
