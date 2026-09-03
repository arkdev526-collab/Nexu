import { requireUser } from "@/mintedup/auth";
import { fail, num, ok, str } from "@/mintedup/http";
import { recordEvent, tokenize } from "@/mintedup/research";
import { assertSameOrigin, enforceRateLimit, SecurityError } from "@/mintedup/security";
import { mutate, newId } from "@/mintedup/store";
import type { ResearchSession, ResearchSignal, SignalType } from "@/mintedup/types";

const TYPES: SignalType[] = [
  "mark", "maker", "material", "form", "motif", "period", "origin", "condition",
  "dimension", "keyword",
];

/** Record one owned observation about the object being researched. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    enforceRateLimit(request, "research-signal", { limit: 30, windowMs: 60_000 }, user.id);
    const body = await request.json();
    const type = TYPES.includes(str(body.type) as SignalType)
      ? (str(body.type) as SignalType)
      : "keyword";
    const value = str(body.value).trim().slice(0, 200);
    if (!value) throw new SecurityError("Record an observation before saving it.", 400);
    const source = ["user", "ai", "confirmed", "rejected"].includes(str(body.source))
      ? (str(body.source) as ResearchSignal["source"])
      : "user";

    const signal: ResearchSignal = {
      id: newId("sig"),
      type,
      value,
      source,
      confidence: Math.min(1, Math.max(0, num(body.confidence, source === "confirmed" ? 1 : 0.6))),
      notedAt: new Date().toISOString(),
    };

    const sessionId = await mutate((db) => {
      let session: ResearchSession | undefined;
      if (body.sessionId) {
        session = db.researchSessions.find((candidate) => candidate.id === str(body.sessionId));
        if (!session) throw new SecurityError("Research session not found.", 404);
        if (session.userId !== user.id) throw new SecurityError("That research session is not yours.", 403);
      }

      if (!session) {
        session = {
          id: newId("res"),
          userId: user.id,
          title: str(body.title, value || "Untitled research"),
          categoryId: body.categoryId ? str(body.categoryId) : null,
          notes: "",
          signals: [],
          queries: [],
          listingId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies ResearchSession;
        db.researchSessions.push(session);
      }

      session.signals = [
        ...session.signals.filter((existing) => existing.type !== type),
        signal,
      ];
      if (body.notes !== undefined) session.notes = str(body.notes).slice(0, 4000);
      if (body.categoryId) session.categoryId = str(body.categoryId);
      if (body.title) session.title = str(body.title).slice(0, 160);
      session.updatedAt = new Date().toISOString();
      return session.id;
    });

    await recordEvent({
      kind: source === "rejected" ? "suggestion_rejected" : source === "confirmed" ? "suggestion_accepted" : "signal_added",
      terms: [`${type}:${value}`, ...tokenize(value)],
      sessionId,
      userId: user.id,
      categoryId: body.categoryId ? str(body.categoryId) : null,
      docId: body.docId ? str(body.docId) : null,
    });

    return ok({ sessionId, signal }, 201);
  } catch (error) {
    return fail(error);
  }
}
