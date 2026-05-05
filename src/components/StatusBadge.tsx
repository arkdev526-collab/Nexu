import type { ProductStatusTone } from "@/data/products";

const toneStyles: Record<ProductStatusTone, string> = {
  beta: "border-[#f6b35d]/40 bg-[#f6b35d]/12 text-[#ffd49d]",
  external: "border-[#74f7bf]/35 bg-[#74f7bf]/10 text-[#a8ffd7]",
  info: "border-white/20 bg-white/8 text-[#d9e8df]",
};

type StatusBadgeProps = {
  label: string;
  tone?: ProductStatusTone;
};

export function StatusBadge({ label, tone = "info" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-md border px-3 py-1 text-xs font-semibold ${toneStyles[tone]}`}
    >
      {label}
    </span>
  );
}
