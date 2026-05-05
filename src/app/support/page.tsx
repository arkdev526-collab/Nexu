import type { Metadata } from "next";
import { ButtonLink } from "@/components/ButtonLink";
import { Container } from "@/components/Container";
import { LimitationNotice } from "@/components/LimitationNotice";
import { nexuNotePad } from "@/data/products";

export const metadata: Metadata = {
  title: "Support | Nexu Apps",
  description:
    "Product support and install help for Nexu Apps products by Sumero Studio.",
};

const supportTopics = [
  {
    title: "Install NexuNotePad",
    body: "Use the Downloads page to confirm the public beta version, installer filename, and SHA256 hash before running the installer.",
  },
  {
    title: "WebView2 Runtime",
    body: "NexuNotePad may require Microsoft WebView2 Runtime if it is not already installed on the Windows device.",
  },
  {
    title: "Optional AI Assistant",
    body: "AI features require a user-provided OpenAI API key and available API quota. ChatGPT subscriptions and OpenAI API billing are separate.",
  },
  {
    title: "NexuClean help",
    body: "NexuClean support and download details are routed through the dedicated NexuClean website.",
  },
];

export default function SupportPage() {
  return (
    <>
      <section className="border-b border-[rgba(198,238,213,0.12)]">
        <Container className="py-14 lg:py-20">
          <div className="max-w-3xl">
            <h1 className="text-5xl font-black text-white sm:text-6xl">
              Support
            </h1>
            <p className="mt-5 text-lg leading-8 text-[#dbe8df]">
              Product support and install help for the first Nexu Apps release
              set.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                href="/downloads/NexuNotePadSetup-0.5.0-x64-self-contained.exe"
                label="NexuNotePad Downloads"
                variant="primary"
              />
              <ButtonLink
                external
                href="https://www.nexuclean.com"
                label="NexuClean Website"
                variant="secondary"
              />
            </div>
          </div>
        </Container>
      </section>

      <section id="nexunotepad-setup">
        <Container className="py-16">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Setup notes
            </h2>
            <p className="mt-4 text-base leading-7 text-[#c9d9d0]">
              These notes cover known install and runtime caveats. A dedicated
              Nexu Apps support email is not configured in this project.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {supportTopics.map((topic) => (
              <article
                className="rounded-lg border border-[rgba(198,238,213,0.14)] bg-white/4 p-5"
                key={topic.title}
              >
                <h3 className="text-lg font-bold text-white">{topic.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#c9d9d0]">
                  {topic.body}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <Container className="pb-16">
        <LimitationNotice
          title="NexuNotePad public beta notes"
          intro="The beta is usable for testing, but these limitations should stay visible until the product changes."
          items={nexuNotePad.limitations ?? []}
        />
      </Container>
    </>
  );
}
