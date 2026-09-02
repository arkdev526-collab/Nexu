import { requireUser } from "@/mintedup/auth";
import { autocompleteListing } from "@/mintedup/ai";
import { fail, ok, str } from "@/mintedup/http";
import { ListingError } from "@/mintedup/listings";
import { termsFromSignals } from "@/mintedup/research";
import { read, readUpload } from "@/mintedup/store";

/**
 * Beta auto-complete: draft the whole listing from the photographs already
 * uploaded to this draft. Nothing is saved — the draft comes back for the
 * seller to review field by field in the composer.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const listingId = str(body.listingId);

    const context = await read((db) => {
      const listing = db.listings.find((l) => l.id === listingId);
      if (!listing) return null;
      const session = listing.researchSessionId
        ? db.researchSessions.find((s) => s.id === listing.researchSessionId)
        : undefined;
      return {
        sellerId: listing.sellerId,
        categoryId: listing.categoryId,
        images: listing.images.map((i) => ({ filename: i.filename, mediaType: i.mediaType })),
        signals: session ? termsFromSignals(session.signals) : [],
      };
    });

    if (!context) throw new ListingError("Listing not found.", 404);
    if (context.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);
    if (context.images.length === 0) {
      throw new ListingError("Upload your photographs first — auto-complete reads the images.", 422);
    }

    const images: { base64: string; mediaType: string }[] = [];
    for (const image of context.images) {
      const bytes = await readUpload(image.filename);
      if (bytes) images.push({ base64: bytes.toString("base64"), mediaType: image.mediaType });
    }

    const draft = await autocompleteListing({
      images,
      sellerHint: str(body.hint).slice(0, 500),
      categoryId: context.categoryId,
      researchSignals: context.signals,
    });

    return ok({ draft, imagesRead: images.length });
  } catch (error) {
    return fail(error);
  }
}
