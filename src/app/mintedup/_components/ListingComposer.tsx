"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, getCategory } from "@/mintedup/categories";
import { IMAGE_RULES } from "@/mintedup/images";
import type { ConditionGrade, Listing, ListingImage } from "@/mintedup/types";
import { AiSeoButton, type SeoRequest } from "./AiSeoButton";
import { ImageSlots } from "./ImageSlots";
import { FieldLabel } from "./Tooltip";

const GRADES: { id: ConditionGrade; label: string }[] = [
  { id: "mint", label: "Mint — as made, unused" },
  { id: "excellent", label: "Excellent — no faults" },
  { id: "very-good", label: "Very good — light age wear only" },
  { id: "good", label: "Good — honest wear, no major faults" },
  { id: "fair", label: "Fair — faults that affect display" },
  { id: "restoration-project", label: "Restoration project" },
];

const AUTOSAVE_MS = 900;

type Draft = {
  title: string;
  subtitle: string;
  description: string;
  categoryId: string;
  format: "buy" | "bid";
  price: string;
  startingBid: string;
  reserve: string;
  shippingDomestic: string;
  shippingInternational: string;
  collectionOnly: boolean;
  maker: string;
  period: string;
  origin: string;
  materials: string;
  marks: string;
  condition: string;
  conditionGrade: ConditionGrade;
  provenance: string;
  dimensions: string;
  signed: boolean;
  restored: boolean;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
};

function toDraft(listing: Listing): Draft {
  return {
    title: listing.title,
    subtitle: listing.subtitle,
    description: listing.description,
    categoryId: listing.categoryId,
    format: listing.format,
    price: listing.price ? (listing.price / 100).toFixed(2) : "",
    startingBid: listing.startingBid ? (listing.startingBid / 100).toFixed(2) : "",
    reserve: listing.reserve ? (listing.reserve / 100).toFixed(2) : "",
    shippingDomestic: listing.shipping.domestic ? (listing.shipping.domestic / 100).toFixed(2) : "",
    shippingInternational: listing.shipping.international
      ? (listing.shipping.international / 100).toFixed(2)
      : "",
    collectionOnly: listing.shipping.collectionOnly,
    maker: listing.attributes.maker,
    period: listing.attributes.period,
    origin: listing.attributes.origin,
    materials: listing.attributes.materials.join(", "),
    marks: listing.attributes.marks,
    condition: listing.attributes.condition,
    conditionGrade: listing.attributes.conditionGrade,
    provenance: listing.attributes.provenance,
    dimensions: listing.attributes.dimensions,
    signed: listing.attributes.signed,
    restored: listing.attributes.restored,
    metaTitle: listing.seo.metaTitle,
    metaDescription: listing.seo.metaDescription,
    keywords: listing.seo.keywords.join(", "),
  };
}

const money = (value: string) => Math.round((Number.parseFloat(value) || 0) * 100);
const list = (value: string) =>
  value.split(",").map((v) => v.trim()).filter(Boolean);

export function ListingComposer({ listing }: { listing: Listing }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(listing));
  const [images, setImages] = useState<ListingImage[]>(listing.images);
  const [aiFields, setAiFields] = useState<string[]>(listing.seo.aiAssistedFields);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [publishErrors, setPublishErrors] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

  // Beta auto-complete
  const [hint, setHint] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoResult, setAutoResult] = useState<{
    uncertainties: string[];
    confidence: number;
    assisted: string;
    imagesRead: number;
  } | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);

  const category = getCategory(draft.categoryId);
  const firstRender = useRef(true);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const payload = useMemo(
    () => ({
      title: draft.title,
      subtitle: draft.subtitle,
      description: draft.description,
      categoryId: draft.categoryId,
      format: draft.format,
      price: money(draft.price),
      startingBid: money(draft.startingBid),
      reserve: money(draft.reserve),
      attributes: {
        maker: draft.maker,
        period: draft.period,
        origin: draft.origin,
        materials: list(draft.materials),
        marks: draft.marks,
        condition: draft.condition,
        conditionGrade: draft.conditionGrade,
        provenance: draft.provenance,
        dimensions: draft.dimensions,
        signed: draft.signed,
        restored: draft.restored,
      },
      seo: {
        metaTitle: draft.metaTitle,
        metaDescription: draft.metaDescription,
        keywords: list(draft.keywords),
        aiAssistedFields: aiFields,
      },
      shipping: {
        domestic: money(draft.shippingDomestic),
        international: money(draft.shippingInternational),
        collectionOnly: draft.collectionOnly,
      },
    }),
    [draft, aiFields],
  );

  // Autosave. A composer this long must never lose work to a closed tab.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaved("saving");
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/mintedup/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaved(response.ok ? "saved" : "error");
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [payload, listing.id]);

  const seoRequest = useCallback(
    (field: SeoRequest["field"], current: string): SeoRequest => ({
      field,
      current,
      title: draft.title,
      categoryId: draft.categoryId,
      format: draft.format,
      price: money(draft.format === "bid" ? draft.startingBid : draft.price),
      currency: listing.currency,
      attributes: payload.attributes,
    }),
    [draft, payload.attributes, listing.currency],
  );

  const applySeo = (field: keyof Draft, seoField: string) => (value: string, keywords: string[]) => {
    set(field, value as Draft[typeof field] & string);
    setAiFields((prev) => [...new Set([...prev, seoField])]);
    if (keywords.length && !draft.keywords.trim()) set("keywords", keywords.join(", "));
  };

  async function runAutocomplete() {
    setAutoBusy(true);
    setAutoError(null);
    setAutoResult(null);
    const response = await fetch("/api/mintedup/ai/autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: listing.id, hint }),
    });
    const body = await response.json().catch(() => ({}));
    setAutoBusy(false);
    if (!response.ok) {
      setAutoError(body.error ?? "Auto-complete could not run.");
      return;
    }

    const d = body.draft;
    // Never overwrite a field the seller has already written in.
    setDraft((prev) => ({
      ...prev,
      title: prev.title || d.title,
      subtitle: prev.subtitle || d.subtitle,
      description: prev.description || d.description,
      categoryId: CATEGORIES.some((c) => c.id === d.categoryId) ? d.categoryId : prev.categoryId,
      maker: prev.maker || d.maker,
      period: prev.period || d.period,
      origin: prev.origin || d.origin,
      materials: prev.materials || (d.materials ?? []).join(", "),
      marks: prev.marks || d.marks,
      condition: prev.condition || d.condition,
      conditionGrade: prev.conditionGrade === "very-good" ? d.conditionGrade : prev.conditionGrade,
      dimensions: prev.dimensions || d.dimensions,
      metaTitle: prev.metaTitle || d.metaTitle,
      metaDescription: prev.metaDescription || d.metaDescription,
      keywords: prev.keywords || (d.keywords ?? []).join(", "),
    }));
    setAiFields((prev) => [...new Set([...prev, "autocomplete"])]);
    setAutoResult({
      uncertainties: d.uncertainties ?? [],
      confidence: d.confidence ?? 0,
      assisted: d.assisted,
      imagesRead: body.imagesRead ?? 0,
    });
  }

  async function publish() {
    setPublishing(true);
    setPublishErrors([]);
    await fetch(`/api/mintedup/listings/${listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const response = await fetch(`/api/mintedup/listings/${listing.id}/publish`, {
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    setPublishing(false);
    if (!response.ok) {
      setPublishErrors([body.error ?? "The listing could not be published."]);
      return;
    }
    router.push(`/mintedup/listing/${listing.id}`);
    router.refresh();
  }

  const checklist = [
    { done: draft.title.trim().length >= 12, label: "A full title" },
    { done: draft.description.trim().length >= 80, label: "A description" },
    { done: images.length >= 3, label: "Three photographs or more" },
    { done: draft.condition.trim().length > 0, label: "A condition report" },
    {
      done: draft.format === "buy" ? money(draft.price) > 0 : money(draft.startingBid) > 0,
      label: draft.format === "buy" ? "A price" : "An opening bid",
    },
  ];
  const ready = checklist.every((item) => item.done);

  return (
    <div className="mu-sans space-y-10">
      {/* ---- Beta auto-complete, at the top of the composer ---- */}
      <section className="rounded-xl border border-[var(--mu-verdigris)] bg-[rgba(79,155,134,0.07)] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-[var(--mu-verdigris)] px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-[#04120e]">
            Beta
          </span>
          <h2 className="mu-display text-xl">Auto-complete this listing</h2>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--mu-muted)]">
          Upload your photographs first, then let Minted Up read them and draft every field below —
          title, description, category, marks, materials, condition and the search metadata. It
          fills only the fields you have left empty, and it tells you what it could not be sure
          about. You review everything before it publishes.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label className="mu-label" htmlFor="autohint">
              Anything you already know (optional)
            </label>
            <input
              className="mu-input"
              id="autohint"
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              placeholder="Came from a house clearance in Shropshire; mark on the base looks like an anchor"
            />
          </div>
          <button
            type="button"
            className={`mu-btn mu-btn-primary ${autoBusy ? "mu-working" : ""}`}
            onClick={runAutocomplete}
            disabled={autoBusy || images.length === 0}
          >
            {autoBusy ? "Reading your photographs…" : "Auto-complete from images"}
          </button>
        </div>

        {images.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--mu-muted)]">
            Upload at least one photograph to enable this — auto-complete works from the images, not
            from the form.
          </p>
        ) : null}

        {autoError ? <p className="mt-3 text-sm text-[var(--mu-alert)]">{autoError}</p> : null}

        {autoResult ? (
          <div className="mt-4 rounded-lg border border-[var(--mu-line-strong)] bg-[var(--mu-surface)] p-4">
            <p className="text-sm text-[var(--mu-text)]">
              Drafted from {autoResult.imagesRead} photograph
              {autoResult.imagesRead === 1 ? "" : "s"} ·{" "}
              {autoResult.assisted === "claude" ? "Claude" : "local draft, no API key configured"} ·
              confidence {Math.round(autoResult.confidence * 100)}%
            </p>
            {autoResult.uncertainties.length > 0 ? (
              <>
                <p className="mu-label mt-3">Check these before publishing</p>
                <ul className="space-y-1 text-sm text-[var(--mu-muted)]">
                  {autoResult.uncertainties.map((item) => (
                    <li key={item}>— {item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ---- Photographs ---- */}
      <ImageSlots listingId={listing.id} images={images} onChange={setImages} />

      {/* ---- The listing ---- */}
      <section className="space-y-5">
        <h2 className="mu-display text-xl">The listing</h2>

        <div>
          <FieldLabel
            htmlFor="title"
            tipTitle="Listing title"
            tip="60-80 characters works best. Lead with what the object is, then the period or maker, then the one detail that distinguishes it. The AI SEO button rewrites this from the facts you have entered — it will not invent a maker."
            action={
              <AiSeoButton
                field="title"
                label="Title"
                getRequest={() => seoRequest("title", draft.title)}
                onApply={applySeo("title", "title")}
              />
            }
          >
            Title
          </FieldLabel>
          <input
            className="mu-input"
            id="title"
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Regency rosewood card table, brass line inlay"
          />
          <p className="mt-1 text-xs text-[var(--mu-muted)]">{draft.title.length} characters</p>
        </div>

        <div>
          <FieldLabel
            htmlFor="subtitle"
            tipTitle="Subtitle"
            tip="One supporting line under the title. Use it for the detail the title had no room for: dimensions, a date, or the condition headline."
            action={
              <AiSeoButton
                field="subtitle"
                label="Subtitle"
                getRequest={() => seoRequest("subtitle", draft.subtitle)}
                onApply={applySeo("subtitle", "subtitle")}
              />
            }
          >
            Subtitle
          </FieldLabel>
          <input
            className="mu-input"
            id="subtitle"
            value={draft.subtitle}
            onChange={(event) => set("subtitle", event.target.value)}
            placeholder="Circa 1820 · swivel top on a turned column · 91cm wide"
          />
        </div>

        <div>
          <FieldLabel
            htmlFor="description"
            tipTitle="Description"
            tip="Three short paragraphs: what it is, the physical evidence (marks, construction, materials, dimensions), then condition with every fault named. Buyers trust a listing that declares its chips."
            action={
              <AiSeoButton
                field="description"
                label="Description"
                getRequest={() => seoRequest("description", draft.description)}
                onApply={applySeo("description", "description")}
              />
            }
          >
            Description
          </FieldLabel>
          <textarea
            className="mu-input min-h-56"
            id="description"
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel
              htmlFor="category"
              tipTitle="Category"
              tip="Minted Up lists antiques and collectibles only. The category also decides which research prompts and comparable sales the gateway uses for this object."
            >
              Category
            </FieldLabel>
            <select
              className="mu-input"
              id="category"
              value={draft.categoryId}
              onChange={(event) => set("categoryId", event.target.value)}
            >
              {CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {category ? (
              <p className="mt-1.5 text-xs text-[var(--mu-muted)]">{category.blurb}</p>
            ) : null}
          </div>

          <div>
            <FieldLabel
              tipTitle="Sale format"
              tip="Buy it now sells at a fixed price. Bid it runs a seven-day proxy auction with anti-sniping — a bid in the last five minutes extends the lot."
            >
              Sale format
            </FieldLabel>
            <div className="flex gap-1 rounded-lg border border-[var(--mu-line)] p-1">
              {(["buy", "bid"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => set("format", option)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                    draft.format === option
                      ? "bg-[rgba(216,180,90,0.16)] text-[var(--mu-brass)]"
                      : "text-[var(--mu-muted)]"
                  }`}
                >
                  {option === "buy" ? "Buy it" : "Bid it"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          {draft.format === "buy" ? (
            <div>
              <FieldLabel htmlFor="price">Price (£)</FieldLabel>
              <input
                className="mu-input"
                id="price"
                inputMode="decimal"
                value={draft.price}
                onChange={(event) => set("price", event.target.value)}
              />
            </div>
          ) : (
            <>
              <div>
                <FieldLabel htmlFor="startingBid">Opening bid (£)</FieldLabel>
                <input
                  className="mu-input"
                  id="startingBid"
                  inputMode="decimal"
                  value={draft.startingBid}
                  onChange={(event) => set("startingBid", event.target.value)}
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor="reserve"
                  tipTitle="Reserve"
                  tip="The lot will not sell below this. Leave it empty for no reserve — unreserved lots attract more bidders."
                >
                  Reserve (£)
                </FieldLabel>
                <input
                  className="mu-input"
                  id="reserve"
                  inputMode="decimal"
                  value={draft.reserve}
                  onChange={(event) => set("reserve", event.target.value)}
                />
              </div>
            </>
          )}
          <div>
            <FieldLabel htmlFor="shipDomestic">Domestic shipping (£)</FieldLabel>
            <input
              className="mu-input"
              id="shipDomestic"
              inputMode="decimal"
              value={draft.shippingDomestic}
              onChange={(event) => set("shippingDomestic", event.target.value)}
              disabled={draft.collectionOnly}
            />
          </div>
          <div>
            <FieldLabel htmlFor="shipIntl">International shipping (£)</FieldLabel>
            <input
              className="mu-input"
              id="shipIntl"
              inputMode="decimal"
              value={draft.shippingInternational}
              onChange={(event) => set("shippingInternational", event.target.value)}
              disabled={draft.collectionOnly}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--mu-muted)]">
          <input
            type="checkbox"
            checked={draft.collectionOnly}
            onChange={(event) => set("collectionOnly", event.target.checked)}
          />
          Collection only — too large or too fragile to ship
        </label>
      </section>

      {/* ---- The object ---- */}
      <section className="space-y-5">
        <h2 className="mu-display text-xl">The object</h2>
        {category ? (
          <p className="text-sm text-[var(--mu-muted)]">
            For {category.name}, buyers look for: {category.researchPrompts.join("; ")}.
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel
              htmlFor="maker"
              tipTitle="Maker or attribution"
              tip="Only name a maker the evidence supports. Where it is a judgement, say so: 'attributed to', 'in the manner of', 'workshop of'. An attribution that outruns its evidence is how a sale gets unwound."
            >
              Maker or attribution
            </FieldLabel>
            <input
              className="mu-input"
              id="maker"
              value={draft.maker}
              onChange={(event) => set("maker", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="period"
              tipTitle="Period"
              tip="A reign, a decade or a century. If a registration number, patent date or hallmark date letter fixes it, say which."
            >
              Period
            </FieldLabel>
            <input
              className="mu-input"
              id="period"
              value={draft.period}
              onChange={(event) => set("period", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="origin">Origin</FieldLabel>
            <input
              className="mu-input"
              id="origin"
              value={draft.origin}
              onChange={(event) => set("origin", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="materials"
              tipTitle="Materials"
              tip="Comma separated. Say how you know where it matters — silver that tests, brass that is unmarked, a veneer rather than solid timber."
            >
              Materials
            </FieldLabel>
            <input
              className="mu-input"
              id="materials"
              value={draft.materials}
              onChange={(event) => set("materials", event.target.value)}
              placeholder="Rosewood, brass, oak"
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="marks"
              tipTitle="Marks"
              tip="Transcribe exactly what is there, including numbers you cannot explain — do not interpret. Photograph every mark; the research gateway indexes this field."
            >
              Marks and signatures
            </FieldLabel>
            <input
              className="mu-input"
              id="marks"
              value={draft.marks}
              onChange={(event) => set("marks", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="dimensions">Dimensions</FieldLabel>
            <input
              className="mu-input"
              id="dimensions"
              value={draft.dimensions}
              onChange={(event) => set("dimensions", event.target.value)}
              placeholder="91cm wide, 45cm deep, 74cm high"
            />
          </div>
          <div>
            <FieldLabel htmlFor="grade">Condition grade</FieldLabel>
            <select
              className="mu-input"
              id="grade"
              value={draft.conditionGrade}
              onChange={(event) => set("conditionGrade", event.target.value as ConditionGrade)}
            >
              {GRADES.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel
              htmlFor="provenance"
              tipTitle="Provenance"
              tip="Documented chain only: labels, stencils, lot numbers, invoices. Family recollection is context, not provenance — describe it as such."
            >
              Provenance
            </FieldLabel>
            <input
              className="mu-input"
              id="provenance"
              value={draft.provenance}
              onChange={(event) => set("provenance", event.target.value)}
            />
          </div>
        </div>

        <div>
          <FieldLabel
            htmlFor="condition"
            tipTitle="Condition report"
            tip="Name every fault: chips, hairlines, restoration, replaced parts, overpaint, losses. An honest report sells; an omission comes back as a return."
          >
            Condition report
          </FieldLabel>
          <textarea
            className="mu-input min-h-28"
            id="condition"
            value={draft.condition}
            onChange={(event) => set("condition", event.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-6 text-sm text-[var(--mu-muted)]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.signed}
              onChange={(event) => set("signed", event.target.checked)}
            />
            Signed or marked
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.restored}
              onChange={(event) => set("restored", event.target.checked)}
            />
            Has been restored
          </label>
        </div>
      </section>

      {/* ---- Search visibility ---- */}
      <section className="space-y-5">
        <h2 className="mu-display text-xl">Search visibility</h2>
        <div>
          <FieldLabel
            htmlFor="metaTitle"
            tipTitle="Search title"
            tip="What search engines show as the blue link. 60 characters or fewer, or it gets truncated."
            action={
              <AiSeoButton
                field="metaTitle"
                label="Search title"
                getRequest={() => seoRequest("metaTitle", draft.metaTitle)}
                onApply={applySeo("metaTitle", "metaTitle")}
              />
            }
          >
            Search title
          </FieldLabel>
          <input
            className="mu-input"
            id="metaTitle"
            value={draft.metaTitle}
            onChange={(event) => set("metaTitle", event.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--mu-muted)]">
            {draft.metaTitle.length}/60 characters
          </p>
        </div>
        <div>
          <FieldLabel
            htmlFor="metaDescription"
            tipTitle="Search description"
            tip="140-158 characters. Describe this object specifically — generic copy is what gets rewritten by the search engine instead of shown."
            action={
              <AiSeoButton
                field="metaDescription"
                label="Search description"
                getRequest={() => seoRequest("metaDescription", draft.metaDescription)}
                onApply={applySeo("metaDescription", "metaDescription")}
              />
            }
          >
            Search description
          </FieldLabel>
          <textarea
            className="mu-input min-h-20"
            id="metaDescription"
            value={draft.metaDescription}
            onChange={(event) => set("metaDescription", event.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--mu-muted)]">
            {draft.metaDescription.length}/158 characters
          </p>
        </div>
        <div>
          <FieldLabel
            htmlFor="keywords"
            tipTitle="Keywords"
            tip="Comma separated. The terms a collector would actually type — these also feed the research gateway when this listing joins the corpus."
            action={
              <AiSeoButton
                field="keywords"
                label="Keywords"
                getRequest={() => seoRequest("keywords", draft.keywords)}
                onApply={applySeo("keywords", "keywords")}
              />
            }
          >
            Keywords
          </FieldLabel>
          <input
            className="mu-input"
            id="keywords"
            value={draft.keywords}
            onChange={(event) => set("keywords", event.target.value)}
          />
        </div>
        {aiFields.length > 0 ? (
          <p className="text-xs text-[var(--mu-muted)]">
            AI-assisted fields on this listing: {aiFields.join(", ")}. Recorded for disclosure.
          </p>
        ) : null}
      </section>

      {/* ---- Publish ---- */}
      <section className="sticky bottom-0 -mx-1 rounded-t-xl border-t border-[var(--mu-line-strong)] bg-[#0c0a08]/95 p-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {checklist.map((item) => (
              <li
                key={item.label}
                className={item.done ? "text-[var(--mu-verdigris)]" : "text-[var(--mu-muted)]"}
              >
                {item.done ? "✓" : "○"} {item.label}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--mu-muted)]">
              {saved === "saving"
                ? "Saving…"
                : saved === "saved"
                  ? "Draft saved"
                  : saved === "error"
                    ? "Could not save"
                    : ""}
            </span>
            <button
              type="button"
              className="mu-btn mu-btn-primary"
              onClick={publish}
              disabled={!ready || publishing}
            >
              {publishing ? "Publishing…" : "Publish listing"}
            </button>
          </div>
        </div>
        {publishErrors.length > 0 ? (
          <p className="mt-3 text-sm text-[var(--mu-alert)]">{publishErrors.join(" ")}</p>
        ) : null}
        <p className="mt-2 text-[0.6875rem] text-[var(--mu-muted)]">
          Up to {IMAGE_RULES.maxSlots} photographs per listing. Everything above autosaves as you
          type.
        </p>
      </section>
    </div>
  );
}
