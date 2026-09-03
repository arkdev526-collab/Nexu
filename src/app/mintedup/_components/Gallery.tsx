"use client";

import { useState } from "react";
import type { ListingImage } from "@/mintedup/types";

export function Gallery({ images, title }: { images: ListingImage[]; title: string }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="mu-frame grid aspect-[4/3] place-items-center rounded-xl">
        <p className="mu-sans text-sm uppercase tracking-[0.2em] text-[var(--mu-muted)]">
          No photographs on this lot
        </p>
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div>
      <div className="mu-frame overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- uploads are streamed from the data dir. */}
        <img
          src={`/api/mintedup/images/${current.filename}`}
          alt={current.alt || `${title} — view ${active + 1}`}
          className="max-h-[34rem] w-full object-contain"
        />
      </div>
      <p className="mu-sans mt-2 text-xs text-[var(--mu-muted)]">
        {current.quality.width} × {current.quality.height} px · {current.quality.megapixels} MP ·
        quality score {current.quality.score}/100
      </p>
      {images.length > 1 ? (
        <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`View photograph ${index + 1}`}
              aria-current={index === active}
              className={`aspect-square overflow-hidden rounded-md border transition ${
                index === active
                  ? "border-[var(--mu-brass)]"
                  : "border-[var(--mu-line)] opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- uploads are streamed from the data dir. */}
              <img
                src={`/api/mintedup/images/${image.filename}`}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
