import Link from "next/link";
import { currentUser } from "@/mintedup/auth";
import { isValidCategory } from "@/mintedup/categories";
import { learningStats, research } from "@/mintedup/research";
import { ensureSeeded } from "@/mintedup/seed";
import { ResearchWorkbench } from "../_components/ResearchWorkbench";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Research gateway",
  description:
    "Work out what an antique or collectible is before you list it. Minted Up's research gateway learns from every observation, confirmation and realised price.",
};

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  await ensureSeeded();
  const user = await currentUser();
  const params = await searchParams;
  const stats = await learningStats();
  const category = params.category && isValidCategory(params.category) ? params.category : "";
  const initialQuery = params.q ?? "";
  // Arriving from a listing's "research this object" link should land on an
  // answer, not an empty box waiting for JavaScript.
  const initialResult = initialQuery
    ? await research({ query: initialQuery, categoryId: category || null })
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">
          Research it
        </p>
        <h1 className="mu-display mt-3 text-4xl">The research gateway</h1>
        <p className="mu-sans mt-4 leading-relaxed text-[var(--mu-muted)]">
          Find out what you have before you price it. The gateway reads a curated reference layer,
          the research other sellers have confirmed, and every price the market has actually
          settled on — and it gets better each time someone tells it something.
        </p>
        <p className="mu-sans mt-3 text-sm text-[var(--mu-muted)]">
          {stats.corpusSize} documents · {stats.pricedComparables} realised prices ·{" "}
          {stats.events} learning signals ·{" "}
          <Link className="text-[var(--mu-brass)] hover:underline" href="/mintedup/standards">
            how this works
          </Link>
        </p>
      </div>

      <ResearchWorkbench
        signedIn={Boolean(user)}
        initialQuery={initialQuery}
        initialCategory={category}
        initialResult={initialResult}
      />
    </div>
  );
}
