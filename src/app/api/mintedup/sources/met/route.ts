import { requireRole } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { runMetIngestion } from "@/mintedup/ingestion";
import { MET_PROFILES } from "@/mintedup/source-adapters/met";
import { ensureSeeded } from "@/mintedup/seed";
import { ensureVerifiedSourceSeeds } from "@/mintedup/source-seeds";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireRole("curator");
    return ok({ adapter: "met-open-access", profiles: MET_PROFILES });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureSeeded();
    await ensureVerifiedSourceSeeds();
    const curator = await requireRole("curator");
    enforceRateLimit(request, "source-met-sync", { limit: 4, windowMs: 10 * 60_000 }, curator.id);
    const body = await request.json();
    const profileId = str(body.profileId) || MET_PROFILES[0].id;
    const rawLimit = Number(body.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, Math.round(rawLimit))) : undefined;
    const result = await runMetIngestion({
      profileId,
      actorId: curator.id,
      trigger: "manual",
      limit,
      dryRun: body.dryRun === true,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
