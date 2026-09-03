import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES, categoryName, getCategory } from "./categories";
import type { ConditionGrade, ListingAttributes } from "./types";

/**
 * AI assistance for the listing composer.
 *
 * Two features live here:
 *
 *   • The **AI SEO button** beside the title and description fields, which
 *     rewrites what the seller has typed into something that reads well and
 *     ranks, without inventing facts about the object.
 *   • The **beta auto-complete**, which drafts a whole listing from the
 *     uploaded photographs.
 *
 * Both degrade to a deterministic local generator when no API key is set, so
 * the marketplace is fully usable offline and in CI — `assisted` on the result
 * tells the UI which one answered.
 */

const MODEL = "claude-opus-5";

function client(): Anthropic | null {
  // The SDK also resolves ANTHROPIC_AUTH_TOKEN and an `ant auth login` profile;
  // constructing it is cheap, so only skip when we know nothing is configured.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  return new Anthropic();
}

export const AI_AVAILABLE = (): boolean => client() !== null;

const HOUSE_RULES = `You write for Minted Up, a marketplace and research gateway for antiques and collectibles only.

Rules that override anything else:
- Never invent a maker, date, hallmark, provenance, edition or material. If the seller has not established a fact, do not assert it. Hedged language ("in the manner of", "attributed", "unmarked") is correct where the evidence is thin.
- Never state or imply an authentication, valuation or certificate that has not been provided.
- Use the vocabulary of the trade: form, period, maker, marks, condition, provenance.
- British English. No exclamation marks, no "stunning", "rare" unless the seller has evidenced rarity, no invented urgency.
- Condition faults stay in the copy. An antiques buyer trusts a listing that names its chips.`;

/* ------------------------------------------------------------------ *
 * AI SEO for a single field
 * ------------------------------------------------------------------ */

export type SeoField = "title" | "subtitle" | "description" | "metaTitle" | "metaDescription" | "keywords";

export type SeoContext = {
  field: SeoField;
  current: string;
  title: string;
  categoryId: string;
  attributes: Partial<ListingAttributes>;
  format: "buy" | "bid";
  price: number;
  currency: string;
};

export type SeoResult = {
  value: string;
  keywords: string[];
  rationale: string;
  assisted: "claude" | "local";
};

const SeoSchema = z.object({
  value: z.string().describe("The rewritten field content, ready to paste in."),
  keywords: z.array(z.string()).describe("3-8 search terms a collector would actually type."),
  rationale: z.string().describe("One sentence on what was changed and why it helps search."),
});

const FIELD_BRIEF: Record<SeoField, string> = {
  title:
    "A listing title of 60-80 characters. Lead with the object's form, then period/maker, then the one distinguishing detail. Front-load the words a collector searches.",
  subtitle:
    "A single supporting line of up to 90 characters that adds the detail the title had no room for.",
  description:
    "A description of 140-260 words in three short paragraphs: what the object is and how it presents; the physical evidence (marks, construction, materials, dimensions); condition stated plainly, faults included.",
  metaTitle: "A search-engine title of at most 60 characters. Object, period, maker.",
  metaDescription:
    "A meta description of 140-158 characters that describes the specific object and ends with a reason to open the listing.",
  keywords:
    "Return the 6-8 strongest search terms as the value, comma-separated, ordered by how likely a collector is to type them.",
};

export async function generateSeo(context: SeoContext): Promise<SeoResult> {
  const anthropic = client();
  if (!anthropic) return localSeo(context);

  const category = getCategory(context.categoryId);
  const facts = [
    `Category: ${categoryName(context.categoryId)}`,
    context.attributes.maker && `Maker or attribution: ${context.attributes.maker}`,
    context.attributes.period && `Period: ${context.attributes.period}`,
    context.attributes.origin && `Origin: ${context.attributes.origin}`,
    context.attributes.materials?.length && `Materials: ${context.attributes.materials.join(", ")}`,
    context.attributes.marks && `Marks: ${context.attributes.marks}`,
    context.attributes.dimensions && `Dimensions: ${context.attributes.dimensions}`,
    context.attributes.conditionGrade && `Condition grade: ${context.attributes.conditionGrade}`,
    context.attributes.condition && `Condition notes: ${context.attributes.condition}`,
    context.attributes.provenance && `Provenance: ${context.attributes.provenance}`,
    `Sale format: ${context.format === "bid" ? "auction" : "buy it now"}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: `${HOUSE_RULES}\n\nYou are rewriting one field of a listing. ${category ? `Collectors in "${category.name}" care about: ${category.researchPrompts.join("; ")}.` : ""}`,
      messages: [
        {
          role: "user",
          content: `Rewrite the ${context.field} field.

Brief: ${FIELD_BRIEF[context.field]}

Established facts about this object (do not go beyond them):
${facts}

Current listing title: ${context.title || "(not yet written)"}
Current ${context.field}: ${context.current || "(empty)"}`,
        },
      ],
      output_config: { format: zodOutputFormat(SeoSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) return localSeo(context);
    return { ...parsed, assisted: "claude" };
  } catch {
    // A rate limit or outage must never block someone from listing.
    return localSeo(context);
  }
}

/* ------------------------------------------------------------------ *
 * Beta: complete the listing from the photographs
 * ------------------------------------------------------------------ */

const CONDITION_GRADES = [
  "mint", "excellent", "very-good", "good", "fair", "restoration-project",
] as const;

const AutocompleteSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  categoryId: z.string().describe("One id from the supplied category list."),
  maker: z.string().describe("Empty string if no maker is legible."),
  period: z.string(),
  origin: z.string(),
  materials: z.array(z.string()),
  marks: z.string().describe("Transcribe marks exactly as visible; empty string if none."),
  condition: z.string(),
  conditionGrade: z.enum(CONDITION_GRADES),
  dimensions: z.string().describe("Empty string unless a scale reference makes it measurable."),
  metaTitle: z.string(),
  metaDescription: z.string(),
  keywords: z.array(z.string()),
  imageAlt: z.array(z.string()).describe("One alt text per image supplied, in order."),
  confidence: z.number().describe("0-1: how much of this is legible in the photographs."),
  uncertainties: z.array(z.string()).describe("What the seller must check before publishing."),
});

export type AutocompleteDraft = z.infer<typeof AutocompleteSchema> & {
  assisted: "claude" | "local";
};

export type AutocompleteInput = {
  images: { base64: string; mediaType: string }[];
  sellerHint: string;
  categoryId: string | null;
  /** Anything already confirmed in the research gateway, to anchor the draft. */
  researchSignals: string[];
};

/** Vision on 30 images would be slow and dear; the first 8 carry the evidence. */
const MAX_VISION_IMAGES = 8;

export async function autocompleteListing(input: AutocompleteInput): Promise<AutocompleteDraft> {
  const anthropic = client();
  if (!anthropic || input.images.length === 0) return localAutocomplete(input);

  const catalogue = CATEGORIES.map((c) => `${c.id} — ${c.name}: ${c.blurb}`).join("\n");
  const images = input.images.slice(0, MAX_VISION_IMAGES);

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: `${HOUSE_RULES}

You are drafting a complete listing from photographs. This is a beta feature and the seller will review every field, so it is far better to leave a field empty and name the uncertainty than to guess.

Read the photographs like a cataloguer: form and proportion first, then construction, then marks, then condition. Transcribe any mark exactly as it appears rather than interpreting it. State the condition faults you can see.

Choose categoryId from this list only:
${catalogue}`,
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType as "image/jpeg" | "image/png" | "image/webp",
                data: img.base64,
              },
            })),
            {
              type: "text" as const,
              text: `Draft the listing from these ${images.length} photographs.

Seller's note: ${input.sellerHint || "(none given)"}
Category the seller chose: ${input.categoryId ? categoryName(input.categoryId) : "(not chosen — pick one)"}
Confirmed in research: ${input.researchSignals.length ? input.researchSignals.join("; ") : "(nothing confirmed yet)"}

Return one alt text per photograph, in the order supplied.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(AutocompleteSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) return localAutocomplete(input);
    return { ...parsed, assisted: "claude" };
  } catch {
    return localAutocomplete(input);
  }
}

/* ------------------------------------------------------------------ *
 * Deterministic fallbacks — no API key required
 * ------------------------------------------------------------------ */

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function keywordsFrom(context: SeoContext): string[] {
  const a = context.attributes;
  return [
    a.maker, a.period, a.origin, categoryName(context.categoryId),
    ...(a.materials ?? []),
    context.title.split(/\s+/).slice(0, 3).join(" "),
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.toLowerCase().trim())
    .filter((v, i, all) => all.indexOf(v) === i)
    .slice(0, 8);
}

function localSeo(context: SeoContext): SeoResult {
  const a = context.attributes;
  const category = categoryName(context.categoryId);
  const keywords = keywordsFrom(context);
  const base = context.current.trim() || context.title.trim() || category;

  // Drop descriptors the seller has already put in the title, or the fallback
  // produces "Regency Rosewood Card Table, Regency circa 1820".
  const haystack = base.toLowerCase();
  const descriptors = [a.period, a.origin, a.maker]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value) => !haystack.includes(value.toLowerCase().split(",")[0].trim()))
    .join(", ");

  const value = (() => {
    switch (context.field) {
      case "title":
      case "metaTitle": {
        const composed = titleCase([descriptors, base].filter(Boolean).join(" ").trim());
        return composed.slice(0, context.field === "metaTitle" ? 60 : 80);
      }
      case "subtitle":
        return [a.materials?.join(", "), a.dimensions, a.conditionGrade && `${a.conditionGrade} condition`]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 90);
      case "metaDescription": {
        const line = `${titleCase(base)}. ${[descriptors, a.materials?.join(", ")].filter(Boolean).join(", ")}. ${a.condition ? `Condition: ${a.condition}` : "Condition detailed in full."}`;
        return line.replace(/\s+/g, " ").slice(0, 158);
      }
      case "keywords":
        return keywords.join(", ");
      default: {
        const paragraphs = [
          `${titleCase(base)}${descriptors ? `, ${descriptors}` : ""}.`,
          [
            a.materials?.length
              ? `${a.materials.join(" and ")}${a.materials.length > 1 ? "" : " throughout"}.`
              : "",
            a.marks && a.marks.toLowerCase() !== "none" ? `Marked: ${a.marks}.` : "Unmarked.",
            a.dimensions ? `Measures ${a.dimensions}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          [
            a.conditionGrade ? `Condition is ${a.conditionGrade.replace("-", " ")}.` : "",
            a.condition || "Please study the photographs, which form part of the description.",
            a.provenance ? `Provenance: ${a.provenance}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
        ];
        return paragraphs.filter(Boolean).join("\n\n");
      }
    }
  })();

  return {
    value,
    keywords,
    rationale:
      "Built locally from the facts you have entered — set ANTHROPIC_API_KEY to have Claude write this field.",
    assisted: "local",
  };
}

function localAutocomplete(input: AutocompleteInput): AutocompleteDraft {
  const categoryId = input.categoryId ?? CATEGORIES[0].id;
  const hint = input.sellerHint.trim();
  const signals = input.researchSignals;
  const pick = (prefix: string): string => {
    const found = signals.find((s) => s.toLowerCase().startsWith(`${prefix}:`));
    return found ? found.slice(prefix.length + 1).trim() : "";
  };

  const title = titleCase(hint || categoryName(categoryId)).slice(0, 80);
  return {
    title,
    subtitle: "",
    description: hint
      ? `${titleCase(hint)}.\n\nPhotographs form part of the description. Confirm the marks, materials and condition before publishing.`
      : "",
    categoryId,
    maker: pick("maker"),
    period: pick("period"),
    origin: pick("origin"),
    materials: signals.filter((s) => s.startsWith("material:")).map((s) => s.slice(9)),
    marks: pick("mark"),
    condition: "",
    conditionGrade: "very-good" as ConditionGrade,
    dimensions: pick("dimension"),
    metaTitle: title.slice(0, 60),
    metaDescription: "",
    keywords: signals.map((s) => s.split(":").slice(1).join(":")).filter(Boolean).slice(0, 8),
    imageAlt: input.images.map((_, i) =>
      i === 0 ? `${title} — main view` : `${title} — detail ${i}`,
    ),
    confidence: 0.2,
    uncertainties: [
      "Drafted without vision — no API key is configured, so nothing here was read from your photographs.",
      "Check every field before publishing.",
    ],
    assisted: "local",
  };
}
