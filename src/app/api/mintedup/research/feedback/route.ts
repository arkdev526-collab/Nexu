import { requireUser } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { recordEvent } from "@/mintedup/research";
import { assertSameOrigin, enforceRateLimit, SecurityError } from "@/mintedup/security";
import { read } from "@/mintedup/store";

/** Attributable corpus feedback. Client-supplied terms/category are not trusted. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    enforceRateLimit(request, "research-feedback", { limit: 30, windowMs: 60_000 }, user.id);
    const body = await request.json();
    const docId = str(body.docId);
    if (!docId) throw new SecurityError("A research source is required.", 400);
    const helpful = Boolean(body.helpful);
    const sessionId = body.sessionId ? str(body.sessionId) : null;

    const context = await read((db) => {
      const doc = db.researchDocs.find((candidate) => candidate.id === docId) ?? null;
      const session = sessionId
        ? db.researchSessions.find((candidate) => candidate.id === sessionId) ?? null
        : null;
      const previous = [...db.learningEvents].reverse().find((event) =>
        event.userId === user.id && event.docId === docId &&
        (event.kind === "suggestion_accepted" || event.kind === "suggestion_rejected"),
      ) ?? null;
      return { doc, session, previous };
    });
    if (!context.doc) throw new SecurityError("Research source not found.", 404);
    if (sessionId && (!context.session || context.session.userId !== user.id)) {
      throw new SecurityError("That research session is not yours.", 403);
    }

    const kind = helpful ? "suggestion_accepted" : "suggestion_rejected";
    if (context.previous?.kind === kind) return ok({ recorded: false, unchanged: true });

    await recordEvent({
      kind,
      // The server owns the evidence terms and category. A client cannot submit
      // invented keywords to teach an unrelated category through feedback.
      terms: context.doc.terms,
      docId: context.doc.id,
      sessionId,
      categoryId: context.doc.categoryId,
      userId: user.id,
    });
    return ok({ recorded: true });
  } catch (error) {
    return fail(error);
  }
}
