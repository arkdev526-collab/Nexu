import type { Product } from "@/data/products";
import { ButtonLink } from "./ButtonLink";
import { StatusBadge } from "./StatusBadge";

type DownloadCardProps = {
  product: Product;
};

export function DownloadCard({ product }: DownloadCardProps) {
  if (!product.download) {
    return (
      <article
        className="rounded-lg border border-[rgba(198,238,213,0.14)] bg-[rgba(12,18,16,0.78)] p-5"
        id={product.slug}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{product.name}</h2>
            <p className="mt-2 text-sm leading-6 text-[#c9d9d0]">
              NexuClean download details are available on nexuclean.com.
            </p>
          </div>
          <StatusBadge label={product.status.label} tone={product.status.tone} />
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {product.actions.map((action) => (
            <ButtonLink key={action.label} {...action} />
          ))}
        </div>
      </article>
    );
  }

  return (
    <article
      className="rounded-lg border border-[rgba(198,238,213,0.14)] bg-[rgba(12,18,16,0.78)] p-5"
      id={product.slug}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{product.name}</h2>
          <p className="mt-2 text-sm font-semibold text-[#a8ffd7]">
            {product.download.version}
          </p>
        </div>
        <StatusBadge label={product.status.label} tone={product.status.tone} />
      </div>

      <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/4 p-4">
          <dt className="font-semibold text-white">Installer filename</dt>
          <dd className="mt-2 break-words font-mono text-[#dbe8df]">
            {product.download.filename}
          </dd>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/4 p-4">
          <dt className="font-semibold text-white">SHA256</dt>
          <dd className="mt-2 break-all font-mono text-[#dbe8df]">
            {product.download.sha256}
          </dd>
        </div>
      </dl>

      <ul className="mt-5 grid gap-3 text-sm leading-6 text-[#c9d9d0] sm:grid-cols-2">
        {product.download.notes.map((note) => (
          <li className="flex gap-3" key={note}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#74f7bf]" />
            <span>{note}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-lg border border-[#f6b35d]/24 bg-[#f6b35d]/8 p-4 text-sm leading-6 text-[#f6e5cf]">
        Direct installer hosting is not configured in this site yet. The confirmed
        filename and SHA256 are shown here so the final download link can be added
        without changing product facts.
      </div>
    </article>
  );
}
