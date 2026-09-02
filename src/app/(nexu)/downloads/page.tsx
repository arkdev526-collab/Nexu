import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { DownloadCard } from "@/components/DownloadCard";
import { products } from "@/data/products";

export const metadata: Metadata = {
  title: "Downloads | Nexu Apps",
  description:
    "Download details for Nexu Apps products, including NexuNotePad public beta installer information and SHA256 hash.",
};

export default function DownloadsPage() {
  return (
    <>
      <section className="border-b border-[rgba(198,238,213,0.12)]">
        <Container className="py-14 lg:py-20">
          <div className="max-w-3xl">
            <h1 className="text-5xl font-black text-white sm:text-6xl">
              Downloads
            </h1>
            <p className="mt-5 text-lg leading-8 text-[#dbe8df]">
              Product download details, installer notes, and hash information
              for the current Nexu Apps release set.
            </p>
          </div>
        </Container>
      </section>

      <section>
        <Container className="grid gap-6 py-16">
          {products.map((product) => (
            <DownloadCard key={product.slug} product={product} />
          ))}
        </Container>
      </section>
    </>
  );
}
