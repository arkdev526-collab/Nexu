import { requireUser } from "@/mintedup/auth";
import { fail, ok } from "@/mintedup/http";
import { IMAGE_RULES } from "@/mintedup/images";
import { ListingError } from "@/mintedup/listings";
import { assertSameOrigin, enforceRateLimit } from "@/mintedup/security";
import { newId, read } from "@/mintedup/store";
import {
  pendingObjectKey,
  presignR2Upload,
  uploadStorageBackend,
} from "@/mintedup/upload-storage";

const EDITABLE = new Set(["draft", "changes", "rejected"]);

type AllowedMime = (typeof IMAGE_RULES.allowed)[number];

function extensionForMime(type: AllowedMime): "jpg" | "png" | "webp" {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  return "webp";
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
    const slot = Number(body.slot ?? -1);
    const contentType = String(body.contentType ?? "") as AllowedMime;
    const size = Number(body.size ?? -1);

    if (!listingId) throw new ListingError("Listing is required.", 400);
    if (!Number.isInteger(slot) || slot < 0 || slot >= IMAGE_RULES.maxSlots) {
      throw new ListingError(`Slot must be between 1 and ${IMAGE_RULES.maxSlots}.`, 400);
    }
    if (!IMAGE_RULES.allowed.includes(contentType)) {
      throw new ListingError("Minted Up accepts JPEG, PNG and WebP only.", 415);
    }
    if (!Number.isFinite(size) || size <= 0 || size > IMAGE_RULES.maxBytes) {
      throw new ListingError("Image exceeds the 25 MB upload ceiling.", 413);
    }

    await read((db) => {
      const listing = db.listings.find((candidate) => candidate.id === listingId);
      if (!listing) throw new ListingError("Listing not found.", 404);
      if (listing.sellerId !== user.id) throw new ListingError("That is not your listing.", 403);
      if (!EDITABLE.has(listing.status)) {
        throw new ListingError("Images are locked while this lot is in curation or commerce.", 409);
      }
    });

    // Local development deliberately retains the existing multipart path.
    if (uploadStorageBackend() !== "r2") return ok({ mode: "multipart" });

    const imageId = newId("img");
    const filename = pendingObjectKey({
      userId: user.id,
      listingId,
      imageId,
      extension: extensionForMime(contentType),
    });
    const signed = await presignR2Upload({
      key: filename,
      contentType,
      contentLength: size,
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
