import { requireUser } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";
import { gradeImage, IMAGE_RULES } from "@/mintedup/images";
import { ListingError } from "@/mintedup/listings";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";
import { deleteUpload, mutate, read } from "@/mintedup/store";
import type { ListingImage } from "@/mintedup/types";
import {
  deleteR2Object,
  headR2Object,
  isR2ObjectKey,
  objectKeyBelongsTo,
  parseObjectKey,
  promotePendingR2Object,
  readR2Object,
  uploadStorageBackend,
} from "@/mintedup/upload-storage";

const EDITABLE = new Set(["draft", "changes", "rejected"]);
const MAX_FINALIZE_AGE_MS = 30 * 60_000;

async function deleteStoredUpload(filename: string): Promise<void> {
  if (isR2ObjectKey(filename)) await deleteR2Object(filename);
  else await deleteUpload(filename);
}

/**
 * Turn a private temporary R2 object into a listing photograph.
 *
 * No object-storage side effect is executed inside mutate(): the Durable Data
 * Core may replay a mutation callback after an optimistic concurrency conflict.
 * Promotion happens first, the database mutation stays pure, and a promoted
 * object is rolled back only while the database has not yet taken ownership.
 */
export async function POST(request: Request) {
  let pendingFilename: string | null = null;
  let promotedFilename: string | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    enforceRateLimit(request, "image-finalize", { limit: 30, windowMs: 60_000 }, user.id);

    if (uploadStorageBackend() !== "r2") {
      throw new ListingError("Durable object storage is not enabled for this environment.", 409);
    }

    const body = await request.json().catch(() => ({}));
    const listingId = String(body.listingId ?? "");
    const slot = Number(body.slot ?? -1);
    const filename = String(body.filename ?? "");
    const announcedSize = Number(body.size ?? -1);
    const rawSharpness = body.sharpness;
    const sharpness = rawSharpness === null || rawSharpness === undefined ? null : Number(rawSharpness);

    if (!Number.isInteger(slot) || slot < 0 || slot >= IMAGE_RULES.maxSlots) {
      throw new ListingError("Invalid image slot.", 400);
    }
    if (!objectKeyBelongsTo(filename, user.id, listingId, "pending")) {
      throw new ListingError("That upload does not belong to this listing.", 403);
    }
    const parsed = parseObjectKey(filename);
    if (!parsed || parsed.stage !== "pending") throw new ListingError("Invalid upload reference.", 400);
    if (Date.now() - parsed.createdAt > MAX_FINALIZE_AGE_MS) {
      pendingFilename = filename;
      throw new ListingError("That upload session has expired. Please upload the photograph again.", 410);
    }
    pendingFilename = filename;

    // Re-check the listing immediately before touching the uploaded bytes. The
    // presign request did the same check, but listing state can change between
    // the two requests.
    await read((db) => {
      const listing = db.listings.find((candidate) => candidate.id === listingId);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);
      if (!EDITABLE.has(listing.status)) {
        throw new ListingError("Images are locked while this lot is in curation or commerce.", 409);
      }
    });

    const head = await headR2Object(filename);
    if (!Number.isFinite(head.bytes) || head.bytes <= 0 || head.bytes > IMAGE_RULES.maxBytes) {
      throw new ListingError("Stored upload has an invalid size.", 413);
    }
    if (Number.isFinite(announcedSize) && announcedSize >= 0 && announcedSize !== head.bytes) {
      throw new ListingError("Upload size changed while being processed.", 409);
    }
    if (!IMAGE_RULES.allowed.includes(head.contentType as (typeof IMAGE_RULES.allowed)[number])) {
      throw new ListingError("Stored upload has an unsupported content type.", 415);
    }

    const bytes = await readR2Object(filename);
    if (bytes.length !== head.bytes || bytes.length > IMAGE_RULES.maxBytes) {
      throw new ListingError("Stored upload size does not match its object metadata.", 409);
    }

    const quality = gradeImage(bytes, sharpness === null || Number.isNaN(sharpness) ? null : sharpness);
    if (!quality.accepted) {
      await deleteR2Object(filename);
      pendingFilename = null;
      return ok({ accepted: false, quality }, 422);
    }

    const expectedMime = quality.format === "jpeg" ? "image/jpeg" : `image/${quality.format}`;
    if (head.contentType !== expectedMime) {
      throw new ListingError("The file contents do not match the declared image type.", 415);
    }

    promotedFilename = await promotePendingR2Object({
      pendingKey: filename,
      contentType: expectedMime,
    });
    pendingFilename = null;

    const image: ListingImage = {
      id: parsed.imageId,
      slot,
      filename: promotedFilename,
      mediaType: expectedMime,
      quality,
      alt: "",
      uploadedAt: new Date().toISOString(),
    };

    const result = await mutate((db) => {
      const listing = db.listings.find((candidate) => candidate.id === listingId);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);
      if (!EDITABLE.has(listing.status)) {
        throw new ListingError("Images are locked while this lot is in curation or commerce.", 409);
      }
      const previousFilename =
        listing.images.find((candidate) => candidate.slot === slot)?.filename ?? null;
      listing.images = [
        ...listing.images.filter((candidate) => candidate.slot !== slot),
        image,
      ].sort((a, b) => a.slot - b.slot);
      listing.updatedAt = new Date().toISOString();
      return { previousFilename };
    });

    // The database now owns the new object. Never include it in rollback for a
    // later best-effort cleanup failure of the previous image.
    promotedFilename = null;
    if (result.previousFilename && result.previousFilename !== image.filename) {
      await deleteStoredUpload(result.previousFilename).catch(() => undefined);
    }
    return ok({ accepted: true, image, quality }, 201);
  } catch (error) {
    if (pendingFilename) await deleteR2Object(pendingFilename).catch(() => undefined);
    if (promotedFilename) await deleteR2Object(promotedFilename).catch(() => undefined);
    return fail(error);
  }
}
