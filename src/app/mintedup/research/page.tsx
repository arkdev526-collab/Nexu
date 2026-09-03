import Link from "next/link";
import { currentUser } from "@/mintedup/auth";
import { isValidCategory } from "@/mintedup/categories";
import { learningStats } from "@/mintedup/research";
import { researchV2 } from "@/mintedup/research-v2";
import { ensureSeeded } from "@/mintedup/seed";
import { ResearchWorkbenchV2 } from "../_components/ResearchWorkbenchV2";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Research gateway v2",
  description:
    "Evidence-led antique and collectible research with source provenance, physical comparable matching and realised-price guidance.",
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
  const initialResult = initialQuery
    ? await researchV2({ query: initialQuery, categoryId: category || null, currency: "GBP" })
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <p className="mu-sans text-xs uppercase tracking-[0.24em] text-[var(--mu-brass)]">Research v2 · evidence first</p>
        <h1 className="mu-display mt-3 text-4xl">Research the object, not just the keywords</h1>
        <p className="mu-sans mt-4 leading-relaxed text-[var(--mu-muted)]">
          Minted Up now separates source authority, physical comparability and market evidence. Marks, maker, form, material, period, condition, scale and provenance can outweigh a superficially similar title, while asking prices are kept out of realised-value guidance.
        </p>
        <p className="mu-sans mt-3 text-sm text-[var(--mu-muted)]">
          {stats.corpusSize} documents · {stats.pricedComparables} realised prices · {stats.events} learning signals ·{" "}
          <Link className="text-[var(--mu-brass)] hover:underline" href="/mintedup/standards">how this works</Link>
        </p>
      </div>

      <ResearchWorkbenchV2
        signedIn={Boolean(user)}
        initialQuery={initialQuery}
        initialCategory={category}
        initialResult={initialResult}
      />
    </div>
  );
}
