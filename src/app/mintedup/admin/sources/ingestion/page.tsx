import Link from "next/link";
import { redirect } from "next/navigation";
import { canCurate, currentUser, requireRole } from "@/mintedup/auth";
import { runMetIngestion, scheduledIngestionGate } from "@/mintedup/ingestion";
import { MET_PROFILES } from "@/mintedup/source-adapters/met";
import { ensureSeeded } from "@/mintedup/seed";
import { ensureVerifiedSourceSeeds } from "@/mintedup/source-seeds";
import { sourceLibraryStats } from "@/mintedup/source-library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Source ingestion" };

async function requireCuratorPage() {
  const user = await currentUser();
  if (!user) redirect("/mintedup/signin");
  if (!canCurate(user)) redirect("/mintedup/dashboard");
  return user;
}

async function syncMet(formData: FormData) {
  "use server";
  const curator = await requireRole("curator");
  const profileId = String(formData.get("profileId") ?? MET_PROFILES[0].id);
  const rawLimit = Number(formData.get("limit") ?? 8);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.round(rawLimit))) : 8;
  const dryRun = String(formData.get("mode")) === "preview";
  try {
    const result = await runMetIngestion({ profileId, actorId: curator.id, trigger: "manual", limit, dryRun });
    const params = new URLSearchParams({
      status: result.errors.length ? "partial" : "ok",
      mode: dryRun ? "preview" : "import",
      created: String(result.created),
      duplicates: String(result.duplicates),
      fetched: String(result.fetched),
      eligible: String(result.eligible),
      errors: String(result.errors.length),
      profile: result.profileId,
    });
    redirect(`/mintedup/admin/sources/ingestion?${params.toString()}`);
  } catch (error) {
    redirect(`/mintedup/admin/sources/ingestion?status=error&message=${encodeURIComponent(error instanceof Error ? error.message : "Sync failed")}`);
  }
}

export default async function IngestionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureSeeded();
  await ensureVerifiedSourceSeeds();
  await requireCuratorPage();
  const stats = await sourceLibraryStats();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const gate = scheduledIngestionGate();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">Controlled adapters</p>
          <h1 className="mu-display mt-2 text-4xl">Source ingestion</h1>
          <p className="mu-sans mt-3 leading-relaxed text-[var(--mu-muted)]">
            Pull a small, curated slice of The Met Open Access collection into the Source Library review queue. Public-domain records only; nothing is auto-verified and no museum image is copied into Minted Up.
          </p>
        </div>
        <Link className="mu-btn mu-btn-ghost mu-sans" href="/mintedup/admin/sources">Review source queue</Link>
      </div>

      {value("status") ? (
        <div className="mu-frame mu-sans mt-6 rounded-xl p-4 text-sm">
          {value("status") === "error" ? (
            <p className="text-[var(--mu-alert)]">Sync failed: {value("message")}</p>
          ) : (
            <p className="text-[var(--mu-text)]">
              {value("mode") === "preview" ? "Preview" : "Import"} · fetched {value("fetched")} · eligible {value("eligible")} · new {value("created")} · duplicates {value("duplicates")} · errors {value("errors")}
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="mu-frame rounded-xl p-6">
          <h2 className="mu-display text-xl">The Met Open Access adapter</h2>
          <p className="mu-sans mt-2 text-sm leading-relaxed text-[var(--mu-muted)]">
            Each profile has an editorially fixed Minted Up category. The adapter filters to records the API marks public-domain, stores factual metadata and the official object URL, and leaves every import as a draft for curator verification.
          </p>
          <form action={syncMet} className="mu-sans mt-5 space-y-4">
            <label className="block">
              <span className="mu-label">Profile</span>
              <select className="mu-input" name="profileId" defaultValue={MET_PROFILES[0].id}>
                {MET_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · max {profile.maxPerRun}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mu-label">Maximum eligible records</span>
              <input className="mu-input" name="limit" type="number" min="1" max="20" defaultValue="8" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="mu-btn mu-btn-ghost" type="submit" name="mode" value="preview">Dry-run preview</button>
              <button className="mu-btn mu-btn-primary" type="submit" name="mode" value="import">Import drafts</button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="mu-frame rounded-xl p-5">
            <p className="mu-label">Source Library now</p>
            <p className="mu-display text-3xl text-[var(--mu-brass)]">{stats.total}</p>
            <p className="mu-sans mt-1 text-xs text-[var(--mu-muted)]">{stats.drafts} drafts awaiting review · {stats.verified} verified</p>
          </div>
          <div className="mu-frame rounded-xl p-5">
            <p className="mu-label">Daily schedule</p>
            <p className={`mu-sans text-sm font-semibold ${gate.enabled ? "text-[var(--mu-verdigris)]" : "text-[var(--mu-muted)]"}`}>{gate.enabled ? "Ready" : "Safety-gated"}</p>
            <p className="mu-sans mt-2 text-xs leading-relaxed text-[var(--mu-muted)]">
              The 03:17 UTC Vercel cron is wired, but ingestion only executes when scheduled ingestion, one primary Vercel project and durable shared storage are all explicitly enabled. With the current prototype file store it safely returns “skipped”.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--mu-line)] p-5">
            <p className="mu-label">Operational rule</p>
            <p className="mu-sans text-xs leading-relaxed text-[var(--mu-muted)]">Do not enable the durable-store flag merely to make the cron run. It is an assertion that the file-backed prototype has actually been replaced by shared persistent storage.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
