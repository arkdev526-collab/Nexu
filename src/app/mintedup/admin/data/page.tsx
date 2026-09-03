import Link from "next/link";
import { requireRole } from "@/mintedup/auth";
import { formatDate } from "@/mintedup/format";
import { ensureSeeded } from "@/mintedup/seed";
import { read, storageStatus } from "@/mintedup/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data Core" };

export default async function DataCorePage() {
  await requireRole("admin");
  const status = await storageStatus();
  if (status.ready) await ensureSeeded();
  const counts = status.ready
    ? await read((db) => ({
        users: db.users.length,
        listings: db.listings.length,
        orders: db.orders.length,
        bids: db.bids.length,
        sources: db.sourceRecords.length,
        research: db.researchDocs.length,
        events: db.learningEvents.length,
      }))
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">Durable Data Core</p>
          <h1 className="mu-display mt-2 text-4xl">Storage truth</h1>
          <p className="mu-sans mt-3 leading-relaxed text-[var(--mu-muted)]">This page reports the store Minted Up is actually using. A Postgres URL or legacy durability flag cannot silently switch or mislabel the active backend.</p>
        </div>
        <div className="flex gap-2">
          <Link className="mu-btn mu-btn-ghost mu-sans" href="/mintedup/admin/sources/ingestion">Ingestion</Link>
          <Link className="mu-btn mu-btn-primary mu-sans" href="/mintedup/admin">Admin</Link>
        </div>
      </div>

      <div className="mu-sans mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="mu-frame rounded-xl p-5"><p className="mu-display text-2xl text-[var(--mu-brass)]">{status.backend}</p><p className="mt-1 text-sm text-[var(--mu-muted)]">active backend</p></div>
        <div className="mu-frame rounded-xl p-5"><p className={`mu-display text-2xl ${status.durable ? "text-[var(--mu-verdigris)]" : "text-[var(--mu-alert)]"}`}>{status.durable ? "durable" : "local only"}</p><p className="mt-1 text-sm text-[var(--mu-muted)]">shared data persistence</p></div>
        <div className="mu-frame rounded-xl p-5"><p className="mu-display text-2xl text-[var(--mu-text)]">{status.revision ?? "—"}</p><p className="mt-1 text-sm text-[var(--mu-muted)]">Postgres revision</p></div>
        <div className="mu-frame rounded-xl p-5"><p className={`mu-display text-2xl ${status.uploadsDurable ? "text-[var(--mu-verdigris)]" : "text-[var(--mu-alert)]"}`}>{status.uploadsDurable ? "durable" : "local"}</p><p className="mt-1 text-sm text-[var(--mu-muted)]">listing image bytes</p></div>
      </div>

      <section className={`mt-8 rounded-xl border p-5 ${status.ready ? "border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.06)]" : "border-[var(--mu-alert)] bg-[rgba(180,70,70,0.06)]"}`}>
        <h2 className="mu-display text-xl">{status.ready ? "Store responding" : "Store not ready"}</h2>
        <p className="mu-sans mt-2 text-sm leading-relaxed text-[var(--mu-muted)]">{status.message}</p>
        {status.updatedAt ? <p className="mu-sans mt-2 text-xs text-[var(--mu-muted)]">Last state write: {formatDate(status.updatedAt)}</p> : null}
      </section>

      {counts ? (
        <section className="mt-10">
          <h2 className="mu-display text-2xl">Current state</h2>
          <div className="mu-sans mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(counts).map(([label, value]) => <div key={label} className="mu-frame rounded-lg p-4"><p className="mu-display text-xl">{value}</p><p className="text-xs capitalize text-[var(--mu-muted)]">{label}</p></div>)}
          </div>
        </section>
      ) : null}

      <section className="mu-frame mt-10 rounded-xl p-5">
        <h2 className="mu-display text-xl">Postgres cutover</h2>
        <ol className="mu-sans mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--mu-muted)]">
          <li>Provision the canonical Postgres database. Neon is the recommended Vercel path.</li>
          <li>Install <code className="text-[var(--mu-brass)]">@neondatabase/serverless@1.1.0</code> and commit its package-lock change.</li>
          <li>Run <code className="text-[var(--mu-brass)]">npm run db:migrate</code>.</li>
          <li>If needed, import the local snapshot with <code className="text-[var(--mu-brass)]">npm run db:import</code>.</li>
          <li>Set <code className="text-[var(--mu-brass)]">MINTEDUP_STORE_BACKEND=postgres</code> and the database URL on the deployment.</li>
          <li>Only after this page reports Postgres ready should the canonical Vercel project enable scheduled ingestion.</li>
        </ol>
        <p className="mu-sans mt-4 text-xs leading-relaxed text-[var(--mu-muted)]">Database durability does not make uploaded listing images durable. Object storage remains a separate release gate.</p>
      </section>
    </div>
  );
}
