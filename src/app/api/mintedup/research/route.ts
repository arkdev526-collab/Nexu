import { currentUser } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { recordEvent, tokenize } from "@/mintedup/research";
import { researchV2 } from "@/mintedup/research-v2";
import { ensureSeeded } from "@/mintedup/seed";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";
import { ensureVerifiedSourceSeeds } from "@/mintedup/source-seeds";
import { mutate, read } from "@/mintedup/store";

/** Research v2 query boundary. Searches may be anonymous, but every mutation is
 * same-origin and throttled. The model never teaches itself its own prediction. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureSeeded();
    await ensureVerifiedSourceSeeds();
    const user = await currentUser();
    enforceRateLimit(request, "research", { limit: 60, windowMs: 60_000 }, user?.id ?? "anonymous");

    const body = await request.json();
    const query = str(body.query).slice(0, 500);
    const sessionId = body.sessionId ? str(body.sessionId) : null;
    const categoryId = body.categoryId ? str(body.categoryId) : null;
    const currency = ["GBP", "USD", "EUR"].includes(str(body.currency))
      ? (str(body.currency) as "GBP" | "USD" | "EUR")
      : "GBP";

    const signals = sessionId
      ? await read((db) => {
          const session = db.researchSessions.find((candidate) => candidate.id === sessionId);
          if (!session || (user && session.userId !== user.id)) return [];
          return session.signals;
        })
      : [];

    const result = await researchV2({ query, categoryId, signals, currency });

    if (query.trim()) {
      await recordEvent({
        kind: "query",
        terms: tokenize(query),
        sessionId,
        userId: user?.id ?? null,
        // Crucial v2 rule: a model prediction is never written back as truth.
        // Only an explicitly selected category is allowed to teach identity.
        categoryId,
      });
      if (sessionId && user) {
        await mutate((db) => {
          const session = db.researchSessions.find((candidate) => candidate.id === sessionId && candidate.userId === user.id);
          if (!session) return;
          session.queries = [...session.queries, query].slice(-50);
          session.updatedAt = new Date().toISOString();
        });
      }
    }

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
