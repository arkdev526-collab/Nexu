import { requireUser } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";
import { buyNow } from "@/mintedup/listings";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const user = await requireUser();
    enforceRateLimit(request, "buy", { limit: 10, windowMs: 60_000 }, user.id);
    const order = await buyNow({ listingId: id, buyerId: user.id });
    return ok({ order }, 201);
  } catch (error) {
    return fail(error);
  }
}
