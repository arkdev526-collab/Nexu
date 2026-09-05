import { IMAGE_RULES } from "./images";
import { ListingError } from "./listings";

export type AllowedImageMime = (typeof IMAGE_RULES.allowed)[number];

export function validateImageUploadIntent(input: {
  slot: number;
  contentType: string;
  size: number;
}): { slot: number; contentType: AllowedImageMime; size: number } {
  if (!Number.isInteger(input.slot) || input.slot < 0 || input.slot >= IMAGE_RULES.maxSlots) {
    throw new ListingError(`Slot must be between 1 and ${IMAGE_RULES.maxSlots}.`, 400);
  }
  if (!IMAGE_RULES.allowed.includes(input.contentType as AllowedImageMime)) {
    throw new ListingError("Minted Up accepts JPEG, PNG and WebP only.", 415);
  }
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > IMAGE_RULES.maxBytes) {
    throw new ListingError("Image exceeds the 25 MB upload ceiling.", 413);
  }
  return {
    slot: input.slot,
    contentType: input.contentType as AllowedImageMime,
    size: input.size,
  };
}

export function extensionForMime(type: AllowedImageMime): "jpg" | "png" | "webp" {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  return "webp";
}
