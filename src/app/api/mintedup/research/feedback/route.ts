import { currentUser } from "@/mintedup/auth";
import { fail, ok, str, strArray } from "@/mintedup/http";
import { recordEvent } from "@/mintedup/research";

/**
 * "This result was useful" / "this is not my object".
 *
 * Reweights the document the result came from, so the corpus reorders itself
 * under use without anyone editing it by hand.
 */
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    const body = await request.json();
    const helpful = Boolean(body.helpful);
    await recordEvent({
      kind: helpful ? "suggestion_accepted" : "suggestion_rejected",
      terms: strArray(body.terms),
      docId: body.docId ? str(body.docId) : null,
      sessionId: body.sessionId ? str(body.sessionId) : null,
      categoryId: body.categoryId ? str(body.categoryId) : null,
      userId: user?.id ?? null,
    });
    return ok({ recorded: true });
  } catch (error) {
    return fail(error);
  }
}
