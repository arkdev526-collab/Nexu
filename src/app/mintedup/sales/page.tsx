import Link from "next/link";
import { categoryName } from "@/mintedup/categories";
import { auctionsWithCounts, refreshAuctionStatuses } from "@/mintedup/curation";
import { formatDate } from "@/mintedup/format";
import { settleDueAuctions } from "@/mintedup/listings";
import { ensureSeeded } from "@/mintedup/seed";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Curated sales",
  description:
    "The Minted Up sale calendar. Every lot in every sale has been read by a curator before it was catalogued.",
};

const STATUS_STYLE: Record<string, string> = {
  live: "bg-[var(--mu-verdigris)] text-[#04120e]",
  scheduled: "bg-[rgba(216,180,90,0.18)] text-[var(--mu-brass)]",
  closed: "bg-white/5 text-[var(--mu-muted)]",
};

export default async function SalesPage() {
  await ensureSeeded();
  await refreshAuctionStatuses();
  await settleDueAuctions();
  const sales = await auctionsWithCounts();

  const live = sales.filter((s) => s.status === "live");
  const scheduled = sales.filter((s) => s.status === "scheduled");
  const closed = sales.filter((s) => s.status === "closed");

  const section = (title: string, items: typeof sales, empty: string) => (
    <section className="mt-12">
      <h2 className="mu-display text-2xl">{title}</h2>
      {items.length === 0 ? (
        <p className="mu-sans mt-3 text-sm text-[var(--mu-muted)]">{empty}</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {items.map((sale) => (
            <Link key={sale.id} href={`/mintedup/sales/${sale.id}`} className="mu-frame rounded-xl p-6">
              <span
                className={`mu-sans inline-block rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] ${STATUS_STYLE[sale.status]}`}
              >
                {sale.status}
              </span>
              <h3 className="mu-display mt-3 text-xl">{sale.title}</h3>
              <p className="mu-sans mt-1 text-sm text-[var(--mu-muted)]">{sale.strapline}</p>
              <p className="mu-sans mt-3 text-xs text-[var(--mu-muted)]">
                {sale.liveLotCount} lot{sale.liveLotCount === 1 ? "" : "s"} ·{" "}
                {sale.status === "scheduled"
                  ? `opens ${formatDate(sale.opensAt)}`
                  : `closes ${formatDate(sale.closesAt)}`}
              </p>
              {sale.categoryIds.length > 0 ? (
                <p className="mu-sans mt-2 text-xs text-[var(--mu-muted)]">
                  {sale.categoryIds.map(categoryName).join(" · ")}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
      <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">
        The sale calendar
      </p>
      <h1 className="mu-display mt-3 text-4xl">Curated sales</h1>
      <p className="mu-sans mt-4 max-w-2xl leading-relaxed text-[var(--mu-muted)]">
        Minted Up runs scheduled sales rather than an endless feed. A curator reads every lot
        against its photographs before it is catalogued, and bidding closes lot by lot with the
        clock extending on every late bid.
      </p>

      {section("Bidding now", live, "No sale is open at the moment.")}
      {section("Coming up", scheduled, "Nothing scheduled yet.")}
      {section("Closed", closed, "No sales have closed yet.")}
    </div>
  );
}
