import { currentUser } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { recordEvent, research, tokenize } from "@/mintedup/research";
import { ensureSeeded } from "@/mintedup/seed";
import { mutate, read } from "@/mintedup/store";

/**
 * Ask the research gateway a question.
 *
 * Every query is logged as a learning event before the answer comes back —
 * loop 1 of the four described in research.ts. The signals already gathered in
 * this session are folded into the query, so the gateway's answers sharpen as
 * the seller tells it more about the object.
 */
export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const user = await currentUser();
    const body = await request.json();
    const query = str(body.query).slice(0, 500);
    const sessionId = body.sessionId ? str(body.sessionId) : null;
    const categoryId = body.categoryId ? str(body.categoryId) : null;

    const signals = sessionId
      ? await read((db) => db.researchSessions.find((s) => s.id === sessionId)?.signals ?? [])
      : [];

    const result = await research({ query, categoryId, signals });

    if (query.trim()) {
      await recordEvent({
        kind: "query",
        terms: tokenize(query),
        sessionId,
        userId: user?.id ?? null,
        // The top suggestion is the category this query is evidence *for*.
        categoryId: categoryId ?? result.categories[0]?.categoryId ?? null,
      });
      if (sessionId) {
        await mutate((db) => {
          const session = db.researchSessions.find((s) => s.id === sessionId);
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
