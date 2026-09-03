import Link from "next/link";
import { IMAGE_RULES } from "@/mintedup/images";
import { EVENT_WEIGHTS, learningStats } from "@/mintedup/research";
import { ensureSeeded } from "@/mintedup/seed";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Standards",
  description:
    "The Minted Up photography standard, and how the research gateway learns from every observation, confirmation and realised price.",
};

const LOOPS = [
  {
    n: "1",
    name: "What you searched for",
    weight: EVENT_WEIGHTS.query,
    body: "Every query is logged with the terms it used and the category it most likely belongs to. Cheap and plentiful, and treated as such — a search is evidence that two ideas go together in someone's mind, nothing more.",
  },
  {
    n: "2",
    name: "What you confirmed",
    weight: EVENT_WEIGHTS.suggestion_accepted,
    body: "When you press “yes, that's it” on a suggested mark or maker, you have looked at a candidate and judged it. That is worth ten searches, and pressing “no” is worth as much in the other direction.",
  },
  {
    n: "3",
    name: "What you published",
    weight: EVENT_WEIGHTS.listing_published,
    body: "The attributes that survive into a live listing are your considered belief about the object, made at some cost. The listing joins the corpus the moment it publishes, so the next seller researching that mark benefits before it has even sold.",
  },
  {
    n: "4",
    name: "What it sold for",
    weight: EVENT_WEIGHTS.sale_outcome,
    body: "The market has the last word. A sale promotes the listing's record to the priced tier and becomes a comparable; a lot that fails to sell is recorded too, because knowing what did not sell at a price is as useful as knowing what did.",
  },
];

export default async function StandardsPage() {
  await ensureSeeded();
  const stats = await learningStats();

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-6 lg:px-8">
      <h1 className="mu-display text-4xl">Standards</h1>
      <p className="mu-sans mt-4 leading-relaxed text-[var(--mu-muted)]">
        Two things make Minted Up different from a general marketplace: what we will accept as a
        photograph, and what the research gateway does with everything you tell it.
      </p>

      <section className="mt-14">
        <h2 className="mu-display text-2xl">The photography standard</h2>
        <p className="mu-sans mt-3 leading-relaxed text-[var(--mu-muted)]">
          An antiques buyer is buying from the photographs. They need to read a hallmark, see a
          hairline and judge a patina, and none of that survives a screenshot or a picture that has
          been through a messaging app. So the standard is measured rather than requested: your
          browser measures focus before the file leaves your machine, the server measures resolution
          and data density from the file itself, and anything below the bar is refused with the
          reason.
        </p>
        <dl className="mu-sans mt-6 divide-y divide-[var(--mu-line)] border-y border-[var(--mu-line)]">
          {[
            ["Resolution", `At least ${IMAGE_RULES.minLongEdge} px on the long edge, ${IMAGE_RULES.minShortEdge} px on the short edge, and ${IMAGE_RULES.minMegapixels} megapixels overall.`],
            ["Formats", "JPEG, PNG or WebP."],
            ["File weight", `Between ${Math.round(IMAGE_RULES.minBytes / 1024)} KB and ${IMAGE_RULES.maxBytes / 1024 / 1024} MB.`],
            ["Data density", `At least ${IMAGE_RULES.minBytesPerPixel.jpeg} bytes per pixel for a JPEG. This is the test that catches an upscaled thumbnail or a file that has been recompressed — a large image with a small file size has already lost the detail.`],
            ["Focus", `A measured sharpness of ${IMAGE_RULES.minSharpness}/100 or better, from a Laplacian variance computed in your browser.`],
            ["Quantity", `Up to ${IMAGE_RULES.maxSlots} photographs per listing, minimum three to publish. Shoot the piece, then the base, the marks, the wear and any restoration.`],
          ].map(([term, definition]) => (
            <div key={term} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="text-sm font-semibold text-[var(--mu-text)]">{term}</dt>
              <dd className="text-sm leading-relaxed text-[var(--mu-muted)]">{definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-14">
        <h2 className="mu-display text-2xl">How the research gateway learns</h2>
        <p className="mu-sans mt-3 leading-relaxed text-[var(--mu-muted)]">
          The gateway is not a fixed encyclopaedia. Four feedback loops feed it, and they are
          deliberately not weighted equally — the further down this list a signal comes from, the
          more it cost someone to produce, and the more the engine trusts it.
        </p>
        <ol className="mu-sans mt-6 space-y-5">
          {LOOPS.map((loop) => (
            <li key={loop.n} className="mu-frame rounded-xl p-5">
              <div className="flex items-baseline gap-3">
                <span className="mu-display text-2xl text-[var(--mu-brass)]">{loop.n}</span>
                <h3 className="mu-display text-lg">{loop.name}</h3>
                <span className="ml-auto text-xs text-[var(--mu-muted)]">weight {loop.weight}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--mu-muted)]">{loop.body}</p>
            </li>
          ))}
        </ol>

        <h3 className="mu-display mt-10 text-xl">What it does with them</h3>
        <ul className="mu-sans mt-3 space-y-3 text-sm leading-relaxed text-[var(--mu-muted)]">
          <li>
            <strong className="text-[var(--mu-text)]">Retrieval.</strong> A BM25 index over the
            whole corpus, tilted by evidence tier so curated reference material outranks community
            contributions, and by the accumulated feedback each document has earned.
          </li>
          <li>
            <strong className="text-[var(--mu-text)]">Identification.</strong> A naive-Bayes
            posterior over term-and-category co-occurrence, so the gateway can say which category
            your description most likely belongs to <em>and</em> which of your words pushed it
            there.
          </li>
          <li>
            <strong className="text-[var(--mu-text)]">Price.</strong> An empirical-Bayes estimate
            over realised sale prices: the comparables that match your object, pulled toward the
            category average in proportion to how few of them there are. Two comparables give you a
            wide range and a low confidence figure, and it says so rather than pretending.
          </li>
          <li>
            <strong className="text-[var(--mu-text)]">Better questions.</strong> The gateway works
            out which attribute the surviving candidates disagree about most and asks you that,
            because answering it eliminates the largest number of possibilities. That is the
            mechanism by which each thing you tell it improves the next answer.
          </li>
        </ul>

        <h3 className="mu-display mt-10 text-xl">Guardrails</h3>
        <p className="mu-sans mt-3 text-sm leading-relaxed text-[var(--mu-muted)]">
          A system that learns from its users can be taught the wrong thing. Curated reference
          material always outranks the crowd, so a popular misidentification cannot overwrite a
          documented fact. Every signal is an append-only event, so the whole model is reproducible
          and a bad contribution can be traced and removed. And community documents that sellers
          keep rejecting sink and are flagged for human review rather than quietly poisoning
          results.
        </p>
        <p className="mu-sans mt-4 text-sm text-[var(--mu-muted)]">
          Right now: {stats.corpusSize} documents, {stats.pricedComparables} realised prices,{" "}
          {stats.events} recorded signals.
        </p>
      </section>

      <div className="mu-sans mt-12 flex flex-wrap gap-3">
        <Link className="mu-btn mu-btn-primary" href="/mintedup/research">
          Open the research gateway
        </Link>
        <Link className="mu-btn mu-btn-ghost" href="/mintedup/sell">
          Create a listing
        </Link>
      </div>
    </div>
  );
}
