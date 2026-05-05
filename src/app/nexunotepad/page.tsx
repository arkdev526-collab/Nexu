import type { Metadata } from "next";
import { ButtonLink } from "@/components/ButtonLink";
import { Container } from "@/components/Container";
import { FeatureGrid } from "@/components/FeatureGrid";
import { LimitationNotice } from "@/components/LimitationNotice";
import { ProductVisual } from "@/components/ProductVisual";
import { StatusBadge } from "@/components/StatusBadge";
import { nexuNotePad } from "@/data/products";

export const metadata: Metadata = {
  title: "NexuNotePad | Nexu Apps",
  description:
    "NexuNotePad is a local-first code and web editor for Windows from Nexu Apps by Sumero Studio.",
};

export default function NexuNotePadPage() {
  return (
    <>
      <section className="border-b border-[rgba(198,238,213,0.12)]">
        <Container className="grid gap-10 py-14 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:py-20">
          <div>
            <StatusBadge
              label={nexuNotePad.status.label}
              tone={nexuNotePad.status.tone}
            />
            <h1 className="mt-5 text-5xl font-black text-white sm:text-6xl">
              NexuNotePad
            </h1>
            <p className="mt-5 text-2xl font-semibold leading-9 text-[#a8ffd7]">
              Local-first code and web editor for Windows.
            </p>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#dbe8df]">
              NexuNotePad helps you write, preview, and organise code and web
              files in one focused desktop workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                href="/downloads/NexuNotePadSetup-0.5.0-x64-self-contained.exe"
                label="Download Public Beta"
                variant="primary"
              />
              <ButtonLink
                href="#release-notes"
                label="View Release Notes"
                variant="secondary"
              />
              <ButtonLink
                href="/support#nexunotepad-setup"
                label="Setup Notes"
                variant="secondary"
              />
            </div>
          </div>
          <ProductVisual />
        </Container>
      </section>

      <section>
        <Container className="py-16">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Built for focused local editing
            </h2>
            <p className="mt-4 text-base leading-7 text-[#c9d9d0]">
              The first public beta combines editor, file, preview, template,
              import, and lightweight project status workflows without claiming
              features that are not active.
            </p>
          </div>
          <div className="mt-8">
            <FeatureGrid items={nexuNotePad.features} />
          </div>
        </Container>
      </section>

      <Container className="pb-16">
        <LimitationNotice
          title="Important limitations"
          intro="Review these notes before installing or testing the public beta."
          items={nexuNotePad.limitations ?? []}
        />
      </Container>

      <section
        className="border-y border-[rgba(198,238,213,0.12)] bg-[#07100c]/70"
        id="release-notes"
      >
        <Container className="py-16">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Release notes
            </h2>
            <p className="mt-4 text-base leading-7 text-[#c9d9d0]">
              Current release label:{" "}
              <span className="font-semibold text-white">
                NexuNotePad 0.5.0 Public Beta
              </span>
              .
            </p>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            <div className="rounded-lg border border-[rgba(198,238,213,0.14)] bg-white/4 p-5">
              <h3 className="text-lg font-bold text-white">Install context</h3>
              <p className="mt-3 text-sm leading-6 text-[#c9d9d0]">
                Windows x64 installer details are published on the Downloads
                page with the confirmed SHA256 hash.
              </p>
            </div>
            <div className="rounded-lg border border-[rgba(198,238,213,0.14)] bg-white/4 p-5">
              <h3 className="text-lg font-bold text-white">Runtime context</h3>
              <p className="mt-3 text-sm leading-6 text-[#c9d9d0]">
                WebView2 may be required. PHP preview/runtime execution is
                paused and PHP is not bundled.
              </p>
            </div>
            <div className="rounded-lg border border-[rgba(198,238,213,0.14)] bg-white/4 p-5">
              <h3 className="text-lg font-bold text-white">Feature context</h3>
              <p className="mt-3 text-sm leading-6 text-[#c9d9d0]">
                AI requires a user-provided OpenAI API key and available API
                quota. Source Control v1 is read-only status.
              </p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
