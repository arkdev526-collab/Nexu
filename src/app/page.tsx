import type { Metadata } from "next";
import { ButtonLink } from "@/components/ButtonLink";
import { Container } from "@/components/Container";
import { CTASection } from "@/components/CTASection";
import { DownloadCard } from "@/components/DownloadCard";
import { FeatureGrid } from "@/components/FeatureGrid";
import { ProductCard } from "@/components/ProductCard";
import { ProductVisual } from "@/components/ProductVisual";
import { products, site } from "@/data/products";

export const metadata: Metadata = {
  title: "Nexu Apps by Sumero Studio",
  description: site.description,
};

const reasons = [
  "Windows software with clear product status and install notes.",
  "Local-first workflows where they fit the product.",
  "Practical tools for editing, cleaning, and creator utility work.",
  "Plain-language limitations before users download.",
  "Dedicated product pages with version and setup context.",
  "Fast pages with no external image dependencies.",
];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-[rgba(198,238,213,0.12)]">
        <Container className="grid gap-10 py-16 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:py-24">
          <div>
            <h1 className="text-5xl font-black text-white sm:text-6xl">
              Nexu Apps
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-[#dbe8df]">
              Practical Windows tools, editors, and creator software by Sumero
              Studio.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                href="#featured-apps"
                label="View Apps"
                variant="primary"
              />
              <ButtonLink
                href="/downloads#nexunotepad"
                label="Download NexuNotePad"
                variant="secondary"
              />
            </div>
          </div>
          <ProductVisual />
        </Container>
      </section>

      <section id="featured-apps">
        <Container className="py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Featured Apps
            </h2>
            <p className="mt-4 text-base leading-7 text-[#c9d9d0]">
              The first Nexu Apps hub brings together the current public beta
              editor and the dedicated NexuClean product site.
            </p>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {products.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-[rgba(198,238,213,0.12)] bg-[#07100c]/70">
        <Container className="py-16">
          <div className="grid gap-8 lg:grid-cols-[0.74fr_1fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                Why Nexu Apps
              </h2>
              <p className="mt-4 text-base leading-7 text-[#c9d9d0]">
                This hub keeps product positioning, beta limitations, download
                details, and support paths in one predictable place.
              </p>
            </div>
            <FeatureGrid items={reasons} columns="two" />
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-16">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                Downloads preview
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#c9d9d0]">
                Confirmed release details are listed before a direct hosting
                link is added.
              </p>
            </div>
            <ButtonLink href="/downloads" label="Open Downloads" variant="secondary" />
          </div>
          <div className="grid gap-5">
            <DownloadCard product={products[0]} />
          </div>
        </Container>
      </section>

      <Container className="pb-16">
        <CTASection
          title="Support preview"
          description="Find setup notes for NexuNotePad, NexuClean website routing, and the currently known install caveats without invented support contacts."
          actions={[
            { label: "Open Support", href: "/support", variant: "primary" },
            { label: "View Downloads", href: "/downloads", variant: "secondary" },
          ]}
        />
      </Container>
    </>
  );
}
