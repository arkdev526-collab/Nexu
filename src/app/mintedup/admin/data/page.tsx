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
  const infrastructureReady =
    status.ready && status.durable && status.uploadsReady && status.uploadsDurable;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">
            Production infrastructure
          </p>
          <h1 className="mu-display mt-2 text-4xl">Storage truth</h1>
          <p className="mu-sans mt-3 leading-relaxed text-[var(--mu-muted)]">
            This page reports the stores Minted Up is actually using. Database durability and listing-image durability are deliberately independent release gates; configured-looking environment variables cannot silently make either one healthy.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            className="mu-btn mu-btn-ghost mu-sans"
            href="/mintedup/admin/sources/ingestion"
          >
            Ingestion
          </Link>
          <Link className="mu-btn mu-btn-primary mu-sans" href="/mintedup/admin">
            Admin
          </Link>
        </div>
      </div>

      <section
        className={`mt-8 rounded-xl border p-5 ${
          infrastructureReady
            ? "border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.06)]"
            : "border-[var(--mu-alert)] bg-[rgba(180,70,70,0.06)]"
        }`}
      >
        <h2 className="mu-display text-xl">
          {infrastructureReady ? "Production storage ready" : "Production storage has open gates"}
        </h2>
        <p className="mu-sans mt-2 text-sm leading-relaxed text-[var(--mu-muted)]">
          {infrastructureReady
            ? "Shared application state and listing-image bytes both have durable backends configured."
            : "Minted Up should not be treated as release-ready until both the database and image storage report durable and ready."}
        </p>
      </section>

      <div className="mu-sans mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="mu-frame rounded-xl p-5">
          <p className="mu-display text-2xl text-[var(--mu-brass)]">{status.backend}</p>
          <p className="mt-1 text-sm text-[var(--mu-muted)]">data backend</p>
        </div>
        <div className="mu-frame rounded-xl p-5">
          <p
            className={`mu-display text-2xl ${
              status.durable ? "text-[var(--mu-verdigris)]" : "text-[var(--mu-alert)]"
            }`}
          >
            {status.durable ? "durable" : "local only"}
          </p>
          <p className="mt-1 text-sm text-[var(--mu-muted)]">shared data persistence</p>
        </div>
        <div className="mu-frame rounded-xl p-5">
          <p className="mu-display text-2xl text-[var(--mu-text)]">{status.revision ?? "—"}</p>
          <p className="mt-1 text-sm text-[var(--mu-muted)]">Postgres revision</p>
        </div>
        <div className="mu-frame rounded-xl p-5">
          <p className="mu-display text-2xl text-[var(--mu-brass)]">{status.uploadBackend}</p>
          <p className="mt-1 text-sm text-[var(--mu-muted)]">image backend</p>
        </div>
        <div className="mu-frame rounded-xl p-5">
          <p
            className={`mu-display text-2xl ${
              status.uploadsDurable && status.uploadsReady
                ? "text-[var(--mu-verdigris)]"
                : "text-[var(--mu-alert)]"
            }`}
          >
            {status.uploadsDurable && status.uploadsReady ? "durable" : "not ready"}
          </p>
          <p className="mt-1 text-sm text-[var(--mu-muted)]">listing image bytes</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section
          className={`rounded-xl border p-5 ${
            status.ready
              ? "border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.06)]"
              : "border-[var(--mu-alert)] bg-[rgba(180,70,70,0.06)]"
          }`}
        >
          <h2 className="mu-display text-xl">
            Database · {status.ready ? "responding" : "not ready"}
          </h2>
          <p className="mu-sans mt-2 text-sm leading-relaxed text-[var(--mu-muted)]">
            {status.message}
          </p>
          {status.updatedAt ? (
            <p className="mu-sans mt-2 text-xs text-[var(--mu-muted)]">
              Last state write: {formatDate(status.updatedAt)}
            </p>
          ) : null}
        </section>

        <section
          className={`rounded-xl border p-5 ${
            status.uploadsReady && status.uploadsDurable
              ? "border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.06)]"
              : "border-[var(--mu-alert)] bg-[rgba(180,70,70,0.06)]"
          }`}
        >
          <h2 className="mu-display text-xl">
            Images · {status.uploadsReady ? "configured" : "not ready"}
          </h2>
          <p className="mu-sans mt-2 text-sm leading-relaxed text-[var(--mu-muted)]">
            {status.uploadMessage}
          </p>
          <p className="mu-sans mt-2 text-xs text-[var(--mu-muted)]">
            Backend: {status.uploadBackend} · configured: {status.uploadsConfigured ? "yes" : "no"}
          </p>
        </section>
      </div>

      {counts ? (
        <section className="mt-10">
          <h2 className="mu-display text-2xl">Current state</h2>
          <div className="mu-sans mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(counts).map(([label, value]) => (
              <div key={label} className="mu-frame rounded-lg p-4">
                <p className="mu-display text-xl">{value}</p>
                <p className="text-xs capitalize text-[var(--mu-muted)]">{label}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mu-frame mt-10 rounded-xl p-5">
        <h2 className="mu-display text-xl">Production activation checklist</h2>
        <ol className="mu-sans mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--mu-muted)]">
          <li>
            Select <code className="text-[var(--mu-brass)]">MINTEDUP_STORE_BACKEND=postgres</code> and provide the restricted production database URL.
          </li>
          <li>
            Select <code className="text-[var(--mu-brass)]">MINTEDUP_UPLOAD_BACKEND=r2</code> and provide the private R2 account, bucket and access-key settings.
          </li>
          <li>
            Configure the R2 bucket CORS policy for the exact Minted Up web origins and <code className="text-[var(--mu-brass)]">PUT</code> with <code className="text-[var(--mu-brass)]">Content-Type</code>.
          </li>
          <li>
            Configure a bucket lifecycle rule to remove abandoned <code className="text-[var(--mu-brass)]">pending-</code> objects after one day. Accepted images are promoted to the separate <code className="text-[var(--mu-brass)]">image-</code> prefix.
          </li>
          <li>Verify this page reports both Postgres and R2 as durable and ready, then exercise an upload, read, replacement and deletion.</li>
          <li>Only after those checks should the single canonical deployment enable scheduled ingestion.</li>
        </ol>
        <p className="mu-sans mt-4 text-xs leading-relaxed text-[var(--mu-muted)]">
          Secrets are intentionally not displayed here. Database and object-storage credentials belong only in the deployment secret store.
        </p>
      </section>
    </div>
  );
}
