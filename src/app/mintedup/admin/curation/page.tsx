import Link from "next/link";
import { redirect } from "next/navigation";
import { canCurate, currentUser } from "@/mintedup/auth";
import { auctionsWithCounts, curationQueue, refreshAuctionStatuses } from "@/mintedup/curation";
import { ensureSeeded } from "@/mintedup/seed";
import { CurationDesk } from "../../_components/CurationDesk";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curation desk" };

export default async function CurationPage() {
  await ensureSeeded();
  const user = await currentUser();
  if (!user) redirect("/mintedup/signin");
  if (!canCurate(user)) redirect("/mintedup/dashboard");

  await refreshAuctionStatuses();
  const [queue, sales] = await Promise.all([curationQueue(), auctionsWithCounts()]);
  // A lot can only be catalogued into a sale that has not closed.
  const openSales = sales.filter((s) => s.status !== "closed");

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mu-sans text-xs uppercase tracking-[0.2em] text-[var(--mu-brass)]">
            Curation
          </p>
          <h1 className="mu-display mt-2 text-4xl">The curation desk</h1>
          <p className="mu-sans mt-1 text-sm text-[var(--mu-muted)]">
            {queue.length} lot{queue.length === 1 ? "" : "s"} waiting ·{" "}
            {queue.filter((q) => q.listing.curation.priority).length} from shop members
          </p>
        </div>
        <Link className="mu-btn mu-btn-ghost mu-sans" href="/mintedup/admin">
          Admin
        </Link>
      </div>

      <CurationDesk queue={queue} auctions={openSales} />
    </div>
  );
}
