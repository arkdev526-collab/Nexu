import { requireUser } from "@/mintedup/auth";
import { fail, ok, str } from "@/mintedup/http";
import { ListingError } from "@/mintedup/listings";
import { entitlements } from "@/mintedup/membership";
import { mutate } from "@/mintedup/store";

/**
 * Boost a lot to the front of the catalogue. A shop-tier benefit, capped at the
 * tier's slot count so the boosted rail stays worth looking at.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const listingId = str(body.listingId);
    const on = body.boosted !== false;
    const slots = entitlements(user).boostSlots;

    if (on && slots === 0) {
      throw new ListingError(
        "Boosted listings are a shop-member benefit. Upgrade for £20 a month to boost three lots at a time.",
        402,
      );
    }

    const result = await mutate((db) => {
      const listing = db.listings.find((l) => l.id === listingId);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);

      if (!on) {
        listing.boostedAt = null;
        return { boosted: false, used: 0, slots };
      }

      const used = db.listings.filter(
        (l) => l.sellerId === user.id && l.boostedAt && l.id !== listing.id,
      ).length;
      if (used >= slots) {
        throw new ListingError(
          `All ${slots} boost slots are in use. Un-boost another lot first.`,
          409,
        );
      }
      listing.boostedAt = new Date().toISOString();
      return { boosted: true, used: used + 1, slots };
    });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
