import Link from "next/link";
import type { Product } from "@/data/products";
import { ButtonLink } from "./ButtonLink";
import { StatusBadge } from "./StatusBadge";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="group flex h-full flex-col justify-between rounded-lg border border-[rgba(198,238,213,0.14)] bg-[rgba(12,18,16,0.78)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.22)] transition hover:border-[#74f7bf]/42">
      <div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-2xl font-bold text-white">
              <Link href={product.path}>{product.name}</Link>
            </h3>
            <p className="mt-2 text-base font-semibold text-[#a8ffd7]">
              {product.title}
            </p>
          </div>
          <StatusBadge label={product.status.label} tone={product.status.tone} />
        </div>
        <p className="mt-5 text-sm leading-6 text-[#c9d9d0]">
          {product.summary}
        </p>
        <ul className="mt-6 grid gap-3 text-sm text-[#dbe8df]">
          {product.features.slice(0, 4).map((feature) => (
            <li className="flex gap-3" key={feature}>
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74f7bf]" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {product.actions.slice(0, 2).map((action) => (
          <ButtonLink key={`${product.slug}-${action.label}`} {...action} />
        ))}
      </div>
    </article>
  );
}
