import { requireUser } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";
import { buyNow } from "@/mintedup/listings";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const order = await buyNow({ listingId: id, buyerId: user.id });
    return ok({ order }, 201);
  } catch (error) {
    return fail(error);
  }
}
