import { requireRole } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";
import { ensureSeeded } from "@/mintedup/seed";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";
import {
  createSourceRecord,
  listSourceRecords,
  sourceLibraryStats,
  type SourceRecordInput,
} from "@/mintedup/source-library";
import { ensureVerifiedSourceSeeds } from "@/mintedup/source-seeds";

/** Curator-facing JSON boundary for future sanctioned source adapters. */
export async function GET() {
  try {
    await ensureSeeded();
    await ensureVerifiedSourceSeeds();
    await requireRole("curator");
    const [records, stats] = await Promise.all([listSourceRecords(), sourceLibraryStats()]);
    return ok({ records, stats });
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
    enforceRateLimit(request, "source-import", { limit: 30, windowMs: 60_000 }, curator.id);

    const body = await request.json() as SourceRecordInput;
    const result = await createSourceRecord(body, curator.id);
    return ok(result, result.created ? 201 : 200);
  } catch (error) {
    return fail(error);
  }
}
