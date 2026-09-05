import { readUpload } from "@/mintedup/store";
import { parseObjectKey, presignR2Read } from "@/mintedup/upload-storage";

/**
 * Serve an uploaded photograph through the stable Minted Up image route.
 *
 * Legacy/local development images are still streamed from the filesystem.
 * Durable production images stay in a private R2 bucket and this route issues
 * a short-lived signed read URL. Pending upload keys are never readable here.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const object = parseObjectKey(filename);

  if (object) {
    if (object.stage !== "image") return new Response("Not found", { status: 404 });
    try {
      const signed = await presignR2Read(filename);
      return new Response(null, {
        status: 307,
        headers: {
          Location: signed.url,
          // Never cache the redirect beyond the lifetime of its signature.
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return new Response("Image storage unavailable", { status: 503 });
    }
  }

  const bytes = await readUpload(filename);
  if (!bytes) return new Response("Not found", { status: 404 });

  const ext = filename.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      // Filenames are content-addressed by upload id, so they never change.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
