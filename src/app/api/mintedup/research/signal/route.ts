import { requireUser } from "@/mintedup/auth";
import { fail, num, ok, str } from "@/mintedup/http";
import { recordEvent, tokenize } from "@/mintedup/research";
import { mutate, newId } from "@/mintedup/store";
import type { ResearchSession, ResearchSignal, SignalType } from "@/mintedup/types";

const TYPES: SignalType[] = [
  "mark", "maker", "material", "form", "motif", "period", "origin", "condition",
  "dimension", "keyword",
];

/**
 * Record one observation about the object being researched — loop 2.
 *
 * A signal marked `confirmed` (the seller pressed "yes, that's it" on a
 * suggestion) carries several times the weight of one the AI merely proposed.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const type = TYPES.includes(str(body.type) as SignalType)
      ? (str(body.type) as SignalType)
      : "keyword";
    const value = str(body.value).trim().slice(0, 200);
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
      let session = body.sessionId
        ? db.researchSessions.find((s) => s.id === str(body.sessionId))
        : undefined;

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

      if (value) {
        // Re-answering an attribute replaces the earlier answer rather than
        // stacking contradictory observations.
        session.signals = [...session.signals.filter((s) => !(s.type === type && s.value.toLowerCase() === value.toLowerCase())), signal];
      }
      if (body.notes !== undefined) session.notes = str(body.notes).slice(0, 4000);
      if (body.categoryId) session.categoryId = str(body.categoryId);
      if (body.title) session.title = str(body.title).slice(0, 160);
      session.updatedAt = new Date().toISOString();
      return session.id;
    });

    if (value) {
      await recordEvent({
        kind: source === "rejected" ? "suggestion_rejected" : source === "confirmed" ? "suggestion_accepted" : "signal_added",
        terms: [`${type}:${value}`, ...tokenize(value)],
        sessionId,
        userId: user.id,
        categoryId: body.categoryId ? str(body.categoryId) : null,
        docId: body.docId ? str(body.docId) : null,
      });
    }

    return ok({ sessionId, signal }, 201);
  } catch (error) {
    return fail(error);
  }
}
