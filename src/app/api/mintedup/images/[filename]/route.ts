import { readUpload } from "@/mintedup/store";

/**
 * Serve an uploaded photograph. Uploads live outside `public/` because they
 * arrive after the build, so they are streamed through here instead.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
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
