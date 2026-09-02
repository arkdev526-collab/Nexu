import type { ImageQuality } from "./types";

/**
 * The high-end image gate.
 *
 * Minted Up only accepts photography good enough to judge an antique from, so
 * uploads are measured rather than trusted. Dimensions and format are read
 * straight out of the file header — no image library, no decode — and combined
 * with the sharpness figure the browser measured before upload.
 *
 * The thresholds live here alone; the composer's tooltip text is generated from
 * them so the guidance can never drift from the rule that is enforced.
 */

export const IMAGE_RULES = {
  maxSlots: 30,
  minLongEdge: 2000,
  minShortEdge: 1400,
  minMegapixels: 3,
  maxBytes: 25 * 1024 * 1024,
  minBytes: 180 * 1024,
  /**
   * File bytes per pixel. A 24MP JPEG that weighs 400KB has been through a
   * messaging app or was upscaled from a thumbnail; either way the detail an
   * antiques buyer needs is already gone.
   */
  minBytesPerPixel: { jpeg: 0.28, webp: 0.16, png: 0.5 },
  /** Laplacian variance, normalised 0-100, measured client-side. */
  minSharpness: 40,
  maxAspectRatio: 3,
  allowed: ["image/jpeg", "image/png", "image/webp"] as const,
} as const;

export const IMAGE_TOOLTIP = [
  `Minimum ${IMAGE_RULES.minLongEdge} px on the long edge and ${IMAGE_RULES.minShortEdge} px on the short edge (${IMAGE_RULES.minMegapixels} megapixels or more).`,
  "JPEG, PNG or WebP, straight from the camera or phone — not a screenshot, not a re-save from a messaging app.",
  `Between ${Math.round(IMAGE_RULES.minBytes / 1024)} KB and ${IMAGE_RULES.maxBytes / 1024 / 1024} MB. A large image with a tiny file size has already lost the detail buyers zoom into.`,
  "Sharp focus on marks, signatures and damage. We measure focus in your browser and reject soft frames.",
  `Up to ${IMAGE_RULES.maxSlots} images per listing. Shoot the piece, then the base, marks, wear and any restoration.`,
].join(" ");

type Header = { width: number; height: number; format: "jpeg" | "png" | "webp" } | null;

function readJpeg(buf: Buffer): Header {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0-SOF15 carry the frame dimensions; C4/C8/CC are tables, not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
        format: "jpeg",
      };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  return null;
}

function readPng(buf: Buffer): Header {
  if (buf.length < 24) return null;
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
}

function readWebp(buf: Buffer): Header {
  if (buf.length < 30) return null;
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF") return null;
  if (buf.subarray(8, 12).toString("ascii") !== "WEBP") return null;
  const chunk = buf.subarray(12, 16).toString("ascii");
  if (chunk === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, format: "webp" };
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: "webp" };
  }
  if (chunk === "VP8X") {
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return { width: w + 1, height: h + 1, format: "webp" };
  }
  return null;
}

export function readImageHeader(buf: Buffer): Header {
  return readJpeg(buf) ?? readPng(buf) ?? readWebp(buf);
}

/**
 * Grade an upload. Returns the full verdict rather than throwing so the
 * composer can show the seller exactly which rule a photo missed.
 */
export function gradeImage(buf: Buffer, sharpness: number | null): ImageQuality {
  const failures: string[] = [];
  const warnings: string[] = [];
  const header = readImageHeader(buf);

  if (!header) {
    return {
      width: 0,
      height: 0,
      megapixels: 0,
      bytes: buf.length,
      format: "jpeg",
      bytesPerPixel: 0,
      sharpness,
      score: 0,
      accepted: false,
      failures: ["We could not read this file as a JPEG, PNG or WebP image."],
      warnings: [],
    };
  }

  const { width, height, format } = header;
  const pixels = width * height;
  const megapixels = pixels / 1e6;
  const bytesPerPixel = pixels > 0 ? buf.length / pixels : 0;
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const aspect = shortEdge > 0 ? longEdge / shortEdge : Infinity;

  if (longEdge < IMAGE_RULES.minLongEdge) {
    failures.push(
      `Long edge is ${longEdge} px — Minted Up needs at least ${IMAGE_RULES.minLongEdge} px.`,
    );
  }
  if (shortEdge < IMAGE_RULES.minShortEdge) {
    failures.push(
      `Short edge is ${shortEdge} px — Minted Up needs at least ${IMAGE_RULES.minShortEdge} px.`,
    );
  }
  if (megapixels < IMAGE_RULES.minMegapixels) {
    failures.push(
      `${megapixels.toFixed(1)} megapixels — the minimum is ${IMAGE_RULES.minMegapixels}.`,
    );
  }
  if (buf.length > IMAGE_RULES.maxBytes) {
    failures.push(`File is ${(buf.length / 1024 / 1024).toFixed(1)} MB, over the 25 MB ceiling.`);
  }
  if (buf.length < IMAGE_RULES.minBytes) {
    failures.push(
      `File is only ${Math.round(buf.length / 1024)} KB. That is too little data for a listing photograph.`,
    );
  }
  const floor = IMAGE_RULES.minBytesPerPixel[format];
  if (bytesPerPixel < floor) {
    failures.push(
      `Heavily compressed or upscaled: ${bytesPerPixel.toFixed(2)} bytes per pixel against a floor of ${floor}. Upload the original file rather than a copy sent through a messaging app.`,
    );
  }
  if (sharpness !== null && sharpness < IMAGE_RULES.minSharpness) {
    failures.push(
      `Focus score ${Math.round(sharpness)}/100, below the ${IMAGE_RULES.minSharpness} we need. Re-shoot with more light and the lens steady.`,
    );
  }
  if (aspect > IMAGE_RULES.maxAspectRatio) {
    warnings.push("Unusually long crop — check you have not cropped the piece itself.");
  }
  if (format === "png" && megapixels > 20) {
    warnings.push("Large PNG. A high-quality JPEG loads faster for buyers with no visible loss.");
  }

  // Score reads as "how far past the bar is this", not a pass/fail restatement.
  const resolutionScore = Math.min(1, megapixels / 12) * 45;
  const dataScore = Math.min(1, bytesPerPixel / (floor * 3)) * 30;
  const focusScore = sharpness === null ? 18 : Math.min(1, sharpness / 80) * 25;
  const score = Math.round(resolutionScore + dataScore + focusScore);

  return {
    width,
    height,
    megapixels: Number(megapixels.toFixed(2)),
    bytes: buf.length,
    format,
    bytesPerPixel: Number(bytesPerPixel.toFixed(3)),
    sharpness,
    score,
    accepted: failures.length === 0,
    failures,
    warnings,
  };
}

export function extensionFor(format: "jpeg" | "png" | "webp"): string {
  return format === "jpeg" ? "jpg" : format;
}
