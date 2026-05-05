import Link from "next/link";
import type { ProductAction } from "@/data/products";

type ButtonLinkProps = ProductAction & {
  className?: string;
};

const baseStyles =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition duration-200 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#f6b35d]";

const variants = {
  primary:
    "bg-[#74f7bf] text-[#04100a] hover:bg-[#9ffbd0] shadow-[0_14px_40px_rgba(56,224,143,0.18)]",
  secondary:
    "border border-[rgba(198,238,213,0.24)] bg-[rgba(255,255,255,0.04)] text-[#f5fbf7] hover:border-[rgba(116,247,191,0.64)] hover:bg-[rgba(116,247,191,0.08)]",
};

export function ButtonLink({
  label,
  href,
  external,
  variant = "secondary",
  className = "",
}: ButtonLinkProps) {
  const classes = `${baseStyles} ${variants[variant]} ${className}`;
  const isDownloadAsset = href.startsWith("/downloads/") && href.includes(".");

  if (external) {
    return (
      <a className={classes} href={href} rel="noreferrer" target="_blank">
        {label}
      </a>
    );
  }

  if (isDownloadAsset) {
    return (
      <a className={classes} download href={href}>
        {label}
      </a>
    );
  }

  return (
    <Link className={classes} href={href}>
      {label}
    </Link>
  );
}
