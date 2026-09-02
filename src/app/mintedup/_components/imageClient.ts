"use client";

/**
 * Browser-side half of the image standard.
 *
 * The server measures resolution, format and file weight from the file header.
 * Focus is the one thing it cannot see without decoding the image, so we
 * measure it here — a Laplacian variance over a downscaled greyscale copy,
 * which is the standard cheap sharpness estimate — and send the figure up with
 * the upload. It is advisory input to the server's verdict, never the verdict
 * itself: the server still rejects on its own measurements if this is missing
 * or absurd.
 */

const SAMPLE_EDGE = 512;

export async function measureSharpness(file: File): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(8, Math.round(bitmap.width * scale));
    const height = Math.max(8, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const { data } = context.getImageData(0, 0, width, height);
    const grey = new Float32Array(width * height);
    for (let i = 0; i < grey.length; i += 1) {
      const p = i * 4;
      grey[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }

    // 3x3 Laplacian. A sharp edge produces a large response; a blurred one does not.
    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        const value =
          -4 * grey[i] + grey[i - 1] + grey[i + 1] + grey[i - width] + grey[i + width];
        sum += value;
        sumSquares += value * value;
        count += 1;
      }
    }
    if (count === 0) return null;
    const mean = sum / count;
    const variance = sumSquares / count - mean * mean;

    // Square-rooted and scaled into 0-100 so the number means something to a
    // seller; the mapping is a heuristic, calibrated against camera photographs.
    return Math.max(0, Math.min(100, Math.round(Math.sqrt(Math.max(0, variance)) * 5)));
  } catch {
    // No bitmap decoder (or a format the browser will not decode) — let the
    // server decide on the measurements it can make itself.
    return null;
  }
}

export function previewUrl(file: File): string {
  return URL.createObjectURL(file);
}
