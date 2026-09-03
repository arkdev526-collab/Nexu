import { requireUser } from "@/mintedup/auth";
import { isValidCategory, CATEGORIES } from "@/mintedup/categories";
import { fail, ok, str } from "@/mintedup/http";
import { createDraft, ListingError } from "@/mintedup/listings";
import { ensureSeeded } from "@/mintedup/seed";
import { read } from "@/mintedup/store";

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const url = new URL(request.url);
    const mine = url.searchParams.get("mine") === "1";
    if (!mine) {
      const listings = await read((db) => db.listings.filter((l) => l.status === "active"));
      return ok({ listings });
    }
    const user = await requireUser();
    const listings = await read((db) => db.listings.filter((l) => l.sellerId === user.id));
    return ok({ listings });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const categoryId = str(body.categoryId, CATEGORIES[0].id);
    // Minted Up sells antiques and collectibles only; the taxonomy is the gate.
    if (!isValidCategory(categoryId)) {
      throw new ListingError("Choose a category from the Minted Up taxonomy.", 400);
    }
    const listing = await createDraft(user.id, categoryId);
    return ok({ listing }, 201);
  } catch (error) {
    return fail(error);
  }
}
