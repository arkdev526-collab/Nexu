import type { Metadata } from "next";
import { ButtonLink } from "@/components/ButtonLink";
import { Container } from "@/components/Container";
import { FeatureGrid } from "@/components/FeatureGrid";
import { StatusBadge } from "@/components/StatusBadge";
import { nexuClean } from "@/data/products";

export const metadata: Metadata = {
  title: "NexuClean | Nexu Apps",
  description:
    "NexuClean is a Windows cleaning and PC utility app built around review-before-delete safety.",
};

export default function NexuCleanPage() {
  return (
    <>
      <section className="border-b border-[rgba(198,238,213,0.12)]">
        <Container className="grid gap-10 py-14 lg:grid-cols-[0.95fr_1fr] lg:items-center lg:py-20">
          <div>
            <StatusBadge
              label={nexuClean.status.label}
              tone={nexuClean.status.tone}
            />
            <h1 className="mt-5 text-5xl font-black text-white sm:text-6xl">
              NexuClean
            </h1>
            <p className="mt-5 text-2xl font-semibold leading-9 text-[#a8ffd7]">
              Clean smarter. Keep control.
            </p>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#dbe8df]">
              A Windows cleaning and PC utility app built around
              review-before-delete safety.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                external
                href="https://www.nexuclean.com"
                label="Visit nexuclean.com"
                variant="primary"
              />
              <ButtonLink
                external
                href="https://www.nexuclean.com"
                label="Download / Learn More"
                variant="secondary"
              />
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-lg border border-[rgba(198,238,213,0.14)] bg-[#07100c] p-6 shadow-[0_24px_100px_rgba(0,0,0,0.36)]"
            aria-hidden="true"
          >
            <div className="absolute right-6 top-6 h-24 w-24 rounded-lg border border-[#74f7bf]/20 bg-[#74f7bf]/8" />
            <div className="relative">
              <div className="mb-8 h-3 w-40 rounded bg-[#74f7bf]/42" />
              <div className="space-y-4">
                {["Review", "Select", "Clean"].map((step, index) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4"
                    key={step}
                  >
                    <span className="text-sm font-bold text-white">{step}</span>
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#74f7bf]/10 text-sm font-bold text-[#74f7bf]">
                      {index + 1}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-8 rounded-lg border border-[#f6b35d]/24 bg-[#f6b35d]/10 p-4 text-sm font-semibold text-[#ffd49d]">
                Review before delete
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-16">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">
                Safety-led positioning
              </h2>
              <p className="mt-4 text-base leading-7 text-[#c9d9d0]">
                NexuClean is presented with direct wording and without fake
                detections, scare tactics, inflated performance promises, or
                unverified badges.
              </p>
              <p className="mt-5 rounded-lg border border-[#74f7bf]/22 bg-[#74f7bf]/8 p-4 text-sm leading-6 text-[#dfffee]">
                NexuClean also has its own dedicated website at nexuclean.com.
              </p>
            </div>
            <FeatureGrid items={nexuClean.features} columns="two" />
          </div>
        </Container>
      </section>
    </>
  );
}
