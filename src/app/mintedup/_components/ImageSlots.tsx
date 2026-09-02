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

/**
 * The 30-slot upload grid.
 *
 * Slot 1 is the cover. Every file is measured for focus in the browser, then
 * graded by the server against the published standard; a rejected file is
 * never stored, and the reason is shown against the slot that refused it.
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

  async function upload(file: File, slot: number) {
    setSlot(slot, { busy: true, rejection: null });
    const sharpness = await measureSharpness(file);

    const form = new FormData();
    form.set("file", file);
    form.set("listingId", listingId);
    form.set("slot", String(slot));
    if (sharpness !== null) form.set("sharpness", String(sharpness));

    const response = await fetch("/api/mintedup/images", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));

    if (response.status === 422 && body.quality) {
      setSlot(slot, { busy: false, rejection: body.quality });
      return;
    }
    if (!response.ok) {
      setSlot(slot, {
        busy: false,
        rejection: {
          width: 0, height: 0, megapixels: 0, bytes: file.size, format: "jpeg",
          bytesPerPixel: 0, sharpness, score: 0, accepted: false,
          failures: [body.error ?? "Upload failed."], warnings: [],
        },
      });
      return;
    }
    setSlot(slot, { busy: false, rejection: null });
    onChange([...images.filter((i) => i.slot !== slot), body.image].sort((a, b) => a.slot - b.slot));
  }

  /** Fill the first free slots, so a bulk drop of 12 photographs just works. */
  async function uploadMany(files: File[], startSlot?: number) {
    const taken = new Set(images.map((i) => i.slot));
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
    await fetch(`/api/mintedup/images?listingId=${listingId}&slot=${slot}`, { method: "DELETE" });
    onChange(images.filter((i) => i.slot !== slot));
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
          void uploadMany([...event.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
        }}
      >
        {Array.from({ length: IMAGE_RULES.maxSlots }, (_, slot) => {
          const image = bySlot.get(slot);
          const slotState = state[slot];
          return (
            <div
              key={slot}
              className={`mu-slot ${image ? "mu-slot-filled" : ""} ${
                slotState?.rejection ? "mu-slot-rejected" : ""
              }`}
              onClick={() => {
                if (image) return;
                targetSlot.current = slot;
                inputRef.current?.click();
              }}
              role="button"
              tabIndex={0}
              aria-label={image ? `Photograph in slot ${slot + 1}` : `Add a photograph to slot ${slot + 1}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (!image) {
                    targetSlot.current = slot;
                    inputRef.current?.click();
                  }
                }
              }}
            >
              {image ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploads are streamed from the data dir. */}
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
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(slot);
                    }}
                  >
                    ×
                  </button>
                </>
              ) : slotState?.busy ? (
                <span className="mu-sans mu-working text-[0.625rem] uppercase tracking-widest text-[var(--mu-brass)]">
                  Checking
                </span>
              ) : (
                <span className="mu-sans text-lg text-[var(--mu-muted)]" aria-hidden>
                  {slotState?.rejection ? "!" : "+"}
                </span>
              )}
            </div>
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
          if (files.length) void uploadMany(files, files.length === 1 && slot !== null ? slot : undefined);
          event.target.value = "";
          targetSlot.current = null;
        }}
      />

      <p className="mu-sans mt-3 text-xs leading-relaxed text-[var(--mu-muted)]">
        Drag a batch of photographs onto the grid, or click a slot. Minimum{" "}
        {IMAGE_RULES.minLongEdge} px on the long edge and {IMAGE_RULES.minMegapixels} MP. We measure
        focus in your browser and resolution on the server — nothing below the standard is stored.
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
