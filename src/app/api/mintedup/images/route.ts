import { requireUser } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";
import { extensionFor, gradeImage, IMAGE_RULES } from "@/mintedup/images";
import { ListingError } from "@/mintedup/listings";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";
import { deleteUpload, mutate, newId, saveUpload } from "@/mintedup/store";
import type { ListingImage } from "@/mintedup/types";

const MAX_MULTIPART_OVERHEAD = 1024 * 1024;
const EDITABLE = new Set(["draft", "changes", "rejected"]);

/** Upload one photograph into one composer slot. */
export async function POST(request: Request) {
  let savedFilename: string | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    enforceRateLimit(request, "image-upload", { limit: 20, windowMs: 60_000 }, user.id);

    const announcedBytes = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(announcedBytes) && announcedBytes > IMAGE_RULES.maxBytes + MAX_MULTIPART_OVERHEAD) {
      throw new ListingError("Upload request is too large.", 413);
    }

    const form = await request.formData();
    const file = form.get("file");
    const listingId = String(form.get("listingId") ?? "");
    const slot = Number(form.get("slot") ?? 0);
    const rawSharpness = form.get("sharpness");
    const sharpness = rawSharpness === null || rawSharpness === "" ? null : Number(rawSharpness);

    if (!(file instanceof File)) throw new ListingError("No file was uploaded.");
    if (file.size > IMAGE_RULES.maxBytes) throw new ListingError("Image exceeds the 25 MB upload ceiling.", 413);
    if (!IMAGE_RULES.allowed.includes(file.type as (typeof IMAGE_RULES.allowed)[number])) {
      throw new ListingError("Minted Up accepts JPEG, PNG and WebP only.", 415);
    }
    if (!Number.isInteger(slot) || slot < 0 || slot >= IMAGE_RULES.maxSlots) {
      throw new ListingError(`Slot must be between 1 and ${IMAGE_RULES.maxSlots}.`);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== file.size || bytes.length > IMAGE_RULES.maxBytes) {
      throw new ListingError("Upload size changed while being processed.", 413);
    }
    const quality = gradeImage(bytes, sharpness === null || Number.isNaN(sharpness) ? null : sharpness);
    if (!quality.accepted) return ok({ accepted: false, quality }, 422);

    const expectedMime = quality.format === "jpeg" ? "image/jpeg" : `image/${quality.format}`;
    if (file.type !== expectedMime) {
      throw new ListingError("The file contents do not match the declared image type.", 415);
    }

    const id = newId("img");
    const image: ListingImage = {
      id,
      slot,
      filename: "",
      mediaType: expectedMime,
      quality,
      alt: "",
      uploadedAt: new Date().toISOString(),
    };

    const result = await mutate(async (db) => {
      const listing = db.listings.find((l) => l.id === listingId);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);
      if (!EDITABLE.has(listing.status)) throw new ListingError("Images are locked while this lot is in curation or commerce.", 409);

      const previousFilename = listing.images.find((candidate) => candidate.slot === slot)?.filename ?? null;
      savedFilename = await saveUpload(id, extensionFor(quality.format), bytes);
      image.filename = savedFilename;
      listing.images = [...listing.images.filter((candidate) => candidate.slot !== slot), image].sort((a, b) => a.slot - b.slot);
      listing.updatedAt = new Date().toISOString();
      return { previousFilename };
    });

    if (result.previousFilename && result.previousFilename !== savedFilename) {
      await deleteUpload(result.previousFilename);
    }
    return ok({ accepted: true, image, quality }, 201);
  } catch (error) {
    if (savedFilename) await deleteUpload(savedFilename).catch(() => undefined);
    return fail(error);
  }
}

/** Remove one photograph from a slot. */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    enforceRateLimit(request, "image-delete", { limit: 40, windowMs: 60_000 }, user.id);
    const url = new URL(request.url);
    const listingId = url.searchParams.get("listingId") ?? "";
    const slot = Number(url.searchParams.get("slot") ?? -1);
    if (!Number.isInteger(slot) || slot < 0 || slot >= IMAGE_RULES.maxSlots) {
      throw new ListingError("Invalid image slot.", 400);
    }

    const removedFilename = await mutate((db) => {
      const listing = db.listings.find((l) => l.id === listingId);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);
      if (!EDITABLE.has(listing.status)) throw new ListingError("Images are locked while this lot is in curation or commerce.", 409);
      const filename = listing.images.find((candidate) => candidate.slot === slot)?.filename ?? null;
      listing.images = listing.images.filter((candidate) => candidate.slot !== slot);
      listing.updatedAt = new Date().toISOString();
      return filename;
    });

    if (removedFilename) await deleteUpload(removedFilename);
    return ok({ removed: Boolean(removedFilename) });
  } catch (error) {
    return fail(error);
  }
}
