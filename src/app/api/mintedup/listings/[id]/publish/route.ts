import { requireUser } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";
import { publishListing } from "@/mintedup/listings";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const listing = await publishListing(id, user.id);
    return ok({ listing });
  } catch (error) {
    return fail(error);
  }
}
