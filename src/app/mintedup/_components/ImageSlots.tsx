"use client";

import { useRef, useState } from "react";
import { IMAGE_RULES, IMAGE_TOOLTIP } from "@/mintedup/images";
import type { ImageQuality, ListingImage } from "@/mintedup/types";
import { measureSharpness } from "./imageClient";
import { Tooltip } from "./Tooltip";

type SlotState = {
  busy: boolean;
  rejection: ImageQuality | null;
};

type PresignResult =
  | { mode: "multipart" }
  | {
      mode: "r2";
      filename: string;
      uploadUrl: string;
      headers: Record<string, string>;
      expiresIn: number;
    };

function failedQuality(file: File, sharpness: number | null, message: string): ImageQuality {
  return {
    width: 0,
    height: 0,
    megapixels: 0,
    bytes: file.size,
    format: "jpeg",
    bytesPerPixel: 0,
    sharpness,
    score: 0,
    accepted: false,
    failures: [message],
    warnings: [],
  };
}

/**
 * The 30-slot upload grid.
 *
 * Slot 1 is the cover. Every file is measured for focus in the browser, then
 * graded by the server against the published standard; a rejected file is
 * never attached to the listing, and the reason is shown against the slot that
 * refused it. Production bytes upload directly to private R2 with a short-lived
 * signed URL; development retains the original local multipart path.
 */
export function ImageSlots({
  listingId,
  images,
  onChange,
}: {
  listingId: string;
  images: ListingImage[];
  onChange: (images: ListingImage[]) => void;
}) {
  const [state, setState] = useState<Record<number, SlotState>>({});
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const targetSlot = useRef<number | null>(null);

  const bySlot = new Map(images.map((image) => [image.slot, image]));
  const accepted = images.length;

  function setSlot(slot: number, next: Partial<SlotState>) {
    setState((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] ?? { busy: false, rejection: null }), ...next },
    }));
  }

  async function cancelPending(filename: string) {
    await fetch("/api/mintedup/images/presign", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, filename }),
    }).catch(() => undefined);
  }

  async function upload(file: File, slot: number) {
    setSlot(slot, { busy: true, rejection: null });
    let pendingFilename: string | null = null;
    let sharpness: number | null = null;

    try {
      sharpness = await measureSharpness(file);

      const presignResponse = await fetch("/api/mintedup/images/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          slot,
          contentType: file.type,
          size: file.size,
        }),
      });
      const presignBody = (await presignResponse.json().catch(() => ({}))) as Partial<PresignResult> & {
        error?: string;
      };

      if (!presignResponse.ok || !presignBody.mode) {
        throw new Error(presignBody.error ?? "Could not prepare the image upload.");
      }

      let response: Response;
      let body: { image?: ListingImage; quality?: ImageQuality; error?: string };

      if (presignBody.mode === "r2") {
        if (!presignBody.filename || !presignBody.uploadUrl) {
          throw new Error("The image upload session was incomplete.");
        }
        pendingFilename = presignBody.filename;
        const directResponse = await fetch(presignBody.uploadUrl, {
          method: "PUT",
          headers: presignBody.headers ?? { "Content-Type": file.type },
          body: file,
        });
        if (!directResponse.ok) {
          throw new Error(`Object storage refused the upload (${directResponse.status}).`);
        }

        response = await fetch("/api/mintedup/images/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId,
            slot,
            filename: pendingFilename,
            size: file.size,
            sharpness,
          }),
        });
        body = await response.json().catch(() => ({}));
        // Once finalisation responds, the server owns pending/final object
        // cleanup on every success and error path.
        pendingFilename = null;
      } else {
        const form = new FormData();
        form.set("file", file);
        form.set("listingId", listingId);
        form.set("slot", String(slot));
        if (sharpness !== null) form.set("sharpness", String(sharpness));

        response = await fetch("/api/mintedup/images", { method: "POST", body: form });
        body = await response.json().catch(() => ({}));
      }

      if (response.status === 422 && body.quality) {
        setSlot(slot, { busy: false, rejection: body.quality });
        return;
      }
      if (!response.ok || !body.image) {
        throw new Error(body.error ?? "Upload failed.");
      }

      setSlot(slot, { busy: false, rejection: null });
      onChange(
        [...images.filter((image) => image.slot !== slot), body.image].sort(
          (a, b) => a.slot - b.slot,
        ),
      );
    } catch (error) {
      if (pendingFilename) await cancelPending(pendingFilename);
      setSlot(slot, {
        busy: false,
        rejection: failedQuality(
          file,
          sharpness,
          error instanceof Error ? error.message : "Upload failed.",
        ),
      });
    }
  }

  /** Fill the first free slots, so a bulk drop of 12 photographs just works. */
  async function uploadMany(files: File[], startSlot?: number) {
    const taken = new Set(images.map((image) => image.slot));
    let cursor = startSlot ?? 0;
    for (const file of files) {
      while (cursor < IMAGE_RULES.maxSlots && taken.has(cursor) && startSlot === undefined) {
        cursor += 1;
      }
      if (cursor >= IMAGE_RULES.maxSlots) break;
      taken.add(cursor);
      await upload(file, cursor);
      cursor += 1;
    }
  }

  async function remove(slot: number) {
    const response = await fetch(`/api/mintedup/images?listingId=${listingId}&slot=${slot}`, {
      method: "DELETE",
    });
    if (!response.ok) return;
    onChange(images.filter((image) => image.slot !== slot));
    setSlot(slot, { busy: false, rejection: null });
  }

  const rejections = Object.entries(state).filter(([, value]) => value.rejection);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="mu-display flex items-center gap-2 text-xl">
          Photographs
          <Tooltip label="Image quality standard">{IMAGE_TOOLTIP}</Tooltip>
        </h2>
        <p className="mu-sans text-sm text-[var(--mu-muted)]">
          {accepted} of {IMAGE_RULES.maxSlots} slots filled
          {accepted > 0 ? " · slot 1 is the cover" : ""}
        </p>
      </div>

      <div
        className={`mu-slots rounded-xl p-1 transition ${
          dragging ? "bg-[rgba(216,180,90,0.08)] outline outline-2 outline-[var(--mu-brass)]" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadMany([...event.dataTransfer.files].filter((file) => file.type.startsWith("image/")));
        }}
      >
        {Array.from({ length: IMAGE_RULES.maxSlots }, (_, slot) => {
          const image = bySlot.get(slot);
          const slotState = state[slot];

          // A filled slot holds its own remove button, so it must not itself be
          // a button — nesting one control inside another is invalid and makes
          // the remove action unreachable by keyboard.
          if (image) {
            return (
              <div key={slot} className="mu-slot mu-slot-filled cursor-default">
                {/* eslint-disable-next-line @next/next/no-img-element -- image bytes live behind the stable Minted Up media route. */}
                <img src={`/api/mintedup/images/${image.filename}`} alt="" />
                <span className="mu-sans absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.625rem] font-bold text-[var(--mu-brass)]">
                  {slot === 0 ? "Cover" : slot + 1}
                </span>
                <span className="mu-sans absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.625rem] text-[var(--mu-muted)]">
                  {image.quality.score}/100
                </span>
                <button
                  type="button"
                  aria-label={`Remove photograph ${slot + 1}`}
                  className="mu-sans absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/70 text-xs text-[var(--mu-alert)]"
                  onClick={() => void remove(slot)}
                >
                  ×
                </button>
              </div>
            );
          }

          return (
            <button
              key={slot}
              type="button"
              className={`mu-slot ${slotState?.rejection ? "mu-slot-rejected" : ""}`}
              aria-label={`Add a photograph to slot ${slot + 1}`}
              onClick={() => {
                targetSlot.current = slot;
                inputRef.current?.click();
              }}
            >
              {slotState?.busy ? (
                <span className="mu-sans mu-working text-[0.625rem] uppercase tracking-widest text-[var(--mu-brass)]">
                  Checking
                </span>
              ) : (
                <span className="mu-sans text-lg text-[var(--mu-muted)]" aria-hidden>
                  {slotState?.rejection ? "!" : "+"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_RULES.allowed.join(",")}
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          const slot = targetSlot.current;
          if (files.length) {
            void uploadMany(files, files.length === 1 && slot !== null ? slot : undefined);
          }
          event.target.value = "";
          targetSlot.current = null;
        }}
      />

      <p className="mu-sans mt-3 text-xs leading-relaxed text-[var(--mu-muted)]">
        Drag a batch of photographs onto the grid, or click a slot. Minimum{" "}
        {IMAGE_RULES.minLongEdge} px on the long edge and {IMAGE_RULES.minMegapixels} MP. We measure
        focus in your browser and resolution on the server — nothing below the standard is attached to
        your listing.
      </p>

      {rejections.length > 0 ? (
        <div className="mu-sans mt-4 space-y-3">
          {rejections.map(([slot, value]) => (
            <div
              key={slot}
              className="rounded-lg border border-[var(--mu-alert)] bg-[rgba(224,118,78,0.08)] p-4"
            >
              <p className="text-sm font-semibold text-[var(--mu-alert)]">
                Slot {Number(slot) + 1} was not accepted
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--mu-muted)]">
                {value.rejection?.failures.map((failure) => (
                  <li key={failure}>— {failure}</li>
                ))}
              </ul>
              {value.rejection && value.rejection.width > 0 ? (
                <p className="mt-2 text-xs text-[var(--mu-muted)]">
                  Measured: {value.rejection.width} × {value.rejection.height} px,{" "}
                  {value.rejection.megapixels} MP, {Math.round(value.rejection.bytes / 1024)} KB,{" "}
                  {value.rejection.bytesPerPixel} bytes per pixel
                  {value.rejection.sharpness !== null
                    ? `, focus ${value.rejection.sharpness}/100`
                    : ""}
                  .
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
