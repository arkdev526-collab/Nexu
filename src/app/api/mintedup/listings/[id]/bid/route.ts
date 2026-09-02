import { requireUser } from "@/mintedup/auth";
import { fail, num, ok } from "@/mintedup/http";
import { placeBid, settleDueAuctions } from "@/mintedup/listings";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
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
