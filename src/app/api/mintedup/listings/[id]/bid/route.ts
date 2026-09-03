import { requireUser } from "@/mintedup/auth";
import { fail, num, ok } from "@/mintedup/http";
import { placeBid, settleDueAuctions } from "@/mintedup/listings";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const user = await requireUser();
    enforceRateLimit(request, "bid", { limit: 30, windowMs: 60_000 }, user.id);
    await settleDueAuctions();
    const body = await request.json();
    const result = await placeBid({
      listingId: id,
      bidderId: user.id,
      maxAmount: Math.round(num(body.maxAmount)),
    });
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
