import { requireUser } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";
import { extensionFor, gradeImage, IMAGE_RULES } from "@/mintedup/images";
import { ListingError } from "@/mintedup/listings";
import { mutate, newId, saveUpload } from "@/mintedup/store";
import type { ListingImage } from "@/mintedup/types";

/**
 * Upload one photograph into one composer slot.
 *
 * The file is graded before it is written to disk, so a rejected image never
 * enters the system at all. The verdict comes back in full either way — the
 * composer shows the seller exactly which rule was missed and by how much.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    const listingId = String(form.get("listingId") ?? "");
    const slot = Number(form.get("slot") ?? 0);
    const rawSharpness = form.get("sharpness");
    const sharpness = rawSharpness === null || rawSharpness === "" ? null : Number(rawSharpness);

    if (!(file instanceof File)) throw new ListingError("No file was uploaded.");
    if (!IMAGE_RULES.allowed.includes(file.type as (typeof IMAGE_RULES.allowed)[number])) {
      throw new ListingError("Minted Up accepts JPEG, PNG and WebP only.", 415);
    }
    if (!Number.isInteger(slot) || slot < 0 || slot >= IMAGE_RULES.maxSlots) {
      throw new ListingError(`Slot must be between 1 and ${IMAGE_RULES.maxSlots}.`);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const quality = gradeImage(bytes, sharpness === null || Number.isNaN(sharpness) ? null : sharpness);

    if (!quality.accepted) {
      return ok({ accepted: false, quality }, 422);
    }

    const id = newId("img");
    const filename = await saveUpload(id, extensionFor(quality.format), bytes);

    const image: ListingImage = {
      id,
      slot,
      filename,
      mediaType: `image/${quality.format}`,
      quality,
      alt: "",
      uploadedAt: new Date().toISOString(),
    };

    await mutate((db) => {
      const listing = db.listings.find((l) => l.id === listingId);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);
      // One image per slot: re-uploading replaces what was there.
      listing.images = [...listing.images.filter((i) => i.slot !== slot), image].sort(
        (a, b) => a.slot - b.slot,
      );
      listing.updatedAt = new Date().toISOString();
    });

    return ok({ accepted: true, image, quality }, 201);
  } catch (error) {
    return fail(error);
  }
}

/** Remove one photograph from a slot. */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const listingId = url.searchParams.get("listingId") ?? "";
    const slot = Number(url.searchParams.get("slot") ?? -1);
    await mutate((db) => {
      const listing = db.listings.find((l) => l.id === listingId);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);
      listing.images = listing.images.filter((i) => i.slot !== slot);
      listing.updatedAt = new Date().toISOString();
    });
    return ok({ removed: true });
  } catch (error) {
    return fail(error);
  }
}
