import { requireUser } from "@/mintedup/auth";
import { validateImageUploadIntent } from "@/mintedup/image-upload-policy";
import { fail, ok } from "@/mintedup/http";
import { extensionFor, gradeImage, IMAGE_RULES } from "@/mintedup/images";
import { ListingError } from "@/mintedup/listings";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";
import { deleteUpload, mutate, newId, read, saveUpload } from "@/mintedup/store";
import type { ListingImage } from "@/mintedup/types";
import {
  deleteR2Object,
  isR2ObjectKey,
  uploadStorageBackend,
} from "@/mintedup/upload-storage";

const MAX_MULTIPART_OVERHEAD = 1024 * 1024;
const EDITABLE = new Set(["draft", "changes", "rejected"]);

async function deleteStoredUpload(filename: string): Promise<void> {
  if (isR2ObjectKey(filename)) await deleteR2Object(filename);
  else await deleteUpload(filename);
}

function assertEditableListing(
  listing: { sellerId: string; status: string } | undefined,
  userId: string,
): void {
  if (!listing) throw new ListingError("Listing not found.", 404);
  if (listing.sellerId !== userId) throw new ListingError("That is not your listing.", 403);
  if (!EDITABLE.has(listing.status)) {
    throw new ListingError("Images are locked while this lot is in curation or commerce.", 409);
  }
}

/**
 * Upload one photograph into one composer slot when the local development
 * filesystem backend is selected. Production R2 uploads use presign/finalize
 * so image bytes travel directly from the browser to object storage.
 */
export async function POST(request: Request) {
  let savedFilename: string | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    enforceRateLimit(request, "image-upload", { limit: 20, windowMs: 60_000 }, user.id);

    if (uploadStorageBackend() === "r2") {
      throw new ListingError("Use the durable direct-upload flow for production images.", 409);
    }

    const announcedBytes = Number(request.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(announcedBytes) &&
      announcedBytes > IMAGE_RULES.maxBytes + MAX_MULTIPART_OVERHEAD
    ) {
      throw new ListingError("Upload request is too large.", 413);
    }

    const form = await request.formData();
    const file = form.get("file");
    const listingId = String(form.get("listingId") ?? "");
    const rawSlot = Number(form.get("slot") ?? 0);
    const rawSharpness = form.get("sharpness");
    const sharpness = rawSharpness === null || rawSharpness === "" ? null : Number(rawSharpness);

    if (!(file instanceof File)) throw new ListingError("No file was uploaded.");
    const intent = validateImageUploadIntent({
      slot: rawSlot,
      contentType: file.type,
      size: file.size,
    });
    const slot = intent.slot;

    // Check ownership before accepting bytes to disk, then check again in the
    // database mutation in case listing state changed between the two steps.
    await read((db) => {
      assertEditableListing(db.listings.find((listing) => listing.id === listingId), user.id);
    });

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== file.size || bytes.length > IMAGE_RULES.maxBytes) {
      throw new ListingError("Upload size changed while being processed.", 413);
    }
    const quality = gradeImage(
      bytes,
      sharpness === null || Number.isNaN(sharpness) ? null : sharpness,
    );
    if (!quality.accepted) return ok({ accepted: false, quality }, 422);

    const expectedMime = quality.format === "jpeg" ? "image/jpeg" : `image/${quality.format}`;
    if (intent.contentType !== expectedMime) {
      throw new ListingError("The file contents do not match the declared image type.", 415);
    }

    const id = newId("img");
    savedFilename = await saveUpload(id, extensionFor(quality.format), bytes);
    const image: ListingImage = {
      id,
      slot,
      filename: savedFilename,
      mediaType: expectedMime,
      quality,
      alt: "",
      uploadedAt: new Date().toISOString(),
    };

    const result = await mutate((db) => {
      const listing = db.listings.find((candidate) => candidate.id === listingId);
      assertEditableListing(listing, user.id);
      const previousFilename =
        listing!.images.find((candidate) => candidate.slot === slot)?.filename ?? null;
      listing!.images = [
        ...listing!.images.filter((candidate) => candidate.slot !== slot),
        image,
      ].sort((a, b) => a.slot - b.slot);
      listing!.updatedAt = new Date().toISOString();
      return { previousFilename };
    });

    // The database now owns the new local file, so subsequent cleanup failures
    // must not trigger rollback of the image the listing references.
    savedFilename = null;
    if (result.previousFilename && result.previousFilename !== image.filename) {
      await deleteStoredUpload(result.previousFilename).catch(() => undefined);
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
      const listing = db.listings.find((candidate) => candidate.id === listingId);
      assertEditableListing(listing, user.id);
      const filename =
        listing!.images.find((candidate) => candidate.slot === slot)?.filename ?? null;
      listing!.images = listing!.images.filter((candidate) => candidate.slot !== slot);
      listing!.updatedAt = new Date().toISOString();
      return filename;
    });

    if (removedFilename) await deleteStoredUpload(removedFilename);
    return ok({ removed: Boolean(removedFilename) });
  } catch (error) {
    return fail(error);
  }
}
