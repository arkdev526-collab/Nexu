import type { ReactNode } from "react";

/**
 * Tooltip attached to a field label. CSS-only on hover, and reachable by
 * keyboard because the trigger is a real button — the image-quality rules are
 * guidance a seller must be able to read, not decoration.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="mu-tip mu-sans align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        className="grid h-[1.125rem] w-[1.125rem] place-items-center rounded-full border border-[var(--mu-line-strong)] text-[0.625rem] font-bold text-[var(--mu-brass)]"
      >
        i
      </button>
      <span role="tooltip" className="mu-tip-bubble mu-sans">
        <strong className="mb-1 block text-[var(--mu-brass)]">{label}</strong>
        {children}
      </span>
    </span>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  tip,
  tipTitle,
  action,
}: {
  htmlFor?: string;
  children: ReactNode;
  tip?: ReactNode;
  tipTitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <label className="mu-label mb-0 flex items-center gap-1.5" htmlFor={htmlFor}>
        {children}
        {tip ? <Tooltip label={tipTitle ?? String(children)}>{tip}</Tooltip> : null}
      </label>
      {action}
    </div>
  );
}
