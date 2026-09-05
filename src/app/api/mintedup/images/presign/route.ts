import { requireUser } from "@/mintedup/auth";
import { extensionForMime, validateImageUploadIntent } from "@/mintedup/image-upload-policy";
import { fail, ok } from "@/mintedup/http";
import { ListingError } from "@/mintedup/listings";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";
import { newId, read } from "@/mintedup/store";
import {
  deleteR2Object,
  objectKeyBelongsTo,
  pendingObjectKey,
  presignR2Upload,
  uploadStorageBackend,
} from "@/mintedup/upload-storage";

const EDITABLE = new Set(["draft", "changes", "rejected"]);

async function assertSellerCanEdit(listingId: string, userId: string): Promise<void> {
  await read((db) => {
    const listing = db.listings.find((candidate) => candidate.id === listingId);
    if (!listing) throw new ListingError("Listing not found.", 404);
    if (listing.sellerId !== userId) throw new ListingError("That is not your listing.", 403);
    if (!EDITABLE.has(listing.status)) {
      throw new ListingError("Images are locked while this lot is in curation or commerce.", 409);
    }
  });
}

/**
 * Issue a short-lived, seller-bound upload URL for durable object storage.
 *
 * The browser receives only a signed PUT URL. R2 credentials never leave the
 * server, and finalisation re-checks ownership, listing state, object size,
 * declared MIME type and the actual image bytes before the image enters the
 * listing record.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    enforceRateLimit(request, "image-presign", { limit: 30, windowMs: 60_000 }, user.id);

    const body = await request.json().catch(() => ({}));
    const listingId = String(body.listingId ?? "");
    if (!listingId) throw new ListingError("Listing is required.", 400);
    const intent = validateImageUploadIntent({
      slot: Number(body.slot ?? -1),
      contentType: String(body.contentType ?? ""),
      size: Number(body.size ?? -1),
    });

    await assertSellerCanEdit(listingId, user.id);

    // Local development deliberately retains the existing multipart path.
    if (uploadStorageBackend() !== "r2") return ok({ mode: "multipart" });

    const imageId = newId("img");
    const filename = pendingObjectKey({
      userId: user.id,
      listingId,
      imageId,
      extension: extensionForMime(intent.contentType),
    });
    const signed = await presignR2Upload({
      key: filename,
      contentType: intent.contentType,
      contentLength: intent.size,
    });

    return ok({
      mode: "r2",
      filename,
      uploadUrl: signed.url,
      headers: signed.headers,
      expiresIn: signed.expiresIn,
    });
  } catch (error) {
    return fail(error);
  }
}

/** Best-effort cleanup for a presigned object when the browser upload fails. */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    enforceRateLimit(request, "image-upload-cancel", { limit: 40, windowMs: 60_000 }, user.id);

    if (uploadStorageBackend() !== "r2") return ok({ removed: false });

    const body = await request.json().catch(() => ({}));
    const listingId = String(body.listingId ?? "");
    const filename = String(body.filename ?? "");
    if (!objectKeyBelongsTo(filename, user.id, listingId, "pending")) {
      throw new ListingError("That upload does not belong to this listing.", 403);
    }

    await assertSellerCanEdit(listingId, user.id);
    await deleteR2Object(filename);
    return ok({ removed: true });
  } catch (error) {
    return fail(error);
  }
}
