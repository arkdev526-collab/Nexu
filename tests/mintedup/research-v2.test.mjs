import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = path.join(os.tmpdir(), `mintedup-research-v2-${process.pid}`);
process.env.MINTEDUP_DATA_DIR = dataDir;
await fs.rm(dataDir, { recursive: true, force: true });

const { mutate } = await import("../../src/mintedup/store.ts");
const { researchV2 } = await import("../../src/mintedup/research-v2.ts");

async function reset() {
  await mutate((db) => {
    db.users = [];
    db.listings = [];
    db.bids = [];
    db.orders = [];
    db.sessions = [];
    db.researchSessions = [];
    db.researchDocs = [];
    db.learningEvents = [];
    db.applications = [];
    db.invites = [];
    db.ledger = [];
    db.auctions = [];
  });
}

function doc(overrides) {
  return {
    id: overrides.id,
    tier: overrides.tier ?? "market",
    title: overrides.title,
    body: overrides.body ?? overrides.title,
    categoryId: overrides.categoryId ?? "ceramics-porcelain",
    terms: overrides.terms,
    realisedPrice: overrides.realisedPrice ?? null,
    currency: overrides.currency ?? "GBP",
    sourceListingId: overrides.sourceListingId ?? null,
    contributedBy: overrides.contributedBy ?? null,
    weight: overrides.weight ?? 0,
    createdAt: new Date().toISOString(),
    priceBasis: overrides.priceBasis,
    askingPrice: overrides.askingPrice,
    sourceType: overrides.sourceType,
    sourceName: overrides.sourceName,
    sourceVerified: overrides.sourceVerified,
  };
}

const signals = [
  { id: "s1", type: "mark", value: "foo crown", source: "confirmed", confidence: 1, notedAt: new Date().toISOString() },
  { id: "s2", type: "form", value: "vase", source: "confirmed", confidence: 1, notedAt: new Date().toISOString() },
  { id: "s3", type: "material", value: "porcelain", source: "user", confidence: 0.8, notedAt: new Date().toISOString() },
  { id: "s4", type: "period", value: "19th century", source: "user", confidence: 0.8, notedAt: new Date().toISOString() },
];

test("physical attribute fit outranks a lexically similar wrong form", async () => {
  await reset();
  await mutate((db) => {
    db.researchDocs.push(
      doc({
        id: "exact",
        title: "Foo crown porcelain vase, 19th century",
        terms: ["mark:foo crown", "form:vase", "material:porcelain", "period:19th century", "keyword:blue white"],
        realisedPrice: 24_000,
        sourceType: "auction-house",
        sourceName: "Example auction result",
        sourceVerified: true,
      }),
      doc({
        id: "wrong-form",
        title: "Foo crown porcelain bowl, 19th century",
        body: "Blue white porcelain foo crown vase style decoration but physically a bowl.",
        terms: ["mark:foo crown", "form:bowl", "material:porcelain", "period:19th century", "keyword:blue white", "keyword:vase"],
        realisedPrice: 240_000,
        sourceType: "auction-house",
        sourceName: "Example auction result",
        sourceVerified: true,
      }),
    );
  });
  const result = await researchV2({ query: "blue white porcelain foo crown vase", categoryId: "ceramics-porcelain", signals });
  assert.equal(result.hits[0]?.doc.id, "exact");
  assert.equal(result.price.comparables[0]?.docId, "exact");
  assert.ok(result.hits.find((hit) => hit.doc.id === "wrong-form")?.attributeConflicts.some((value) => value.includes("form")));
});

test("asking prices are explicitly excluded from realised-value guidance", async () => {
  await reset();
  await mutate((db) => {
    db.researchDocs.push(
      doc({ id: "sold", title: "Realised porcelain vase", terms: ["form:vase", "material:porcelain", "keyword:blue"], realisedPrice: 20_000, priceBasis: "realised" }),
      doc({ id: "asking", title: "Dealer asking porcelain vase", terms: ["form:vase", "material:porcelain", "keyword:blue"], realisedPrice: 900_000, askingPrice: 900_000, priceBasis: "asking", tier: "community", sourceType: "dealer" }),
    );
  });
  const result = await researchV2({
    query: "blue porcelain vase",
    categoryId: "ceramics-porcelain",
    signals: [{ id: "s", type: "form", value: "vase", source: "confirmed", confidence: 1, notedAt: new Date().toISOString() }],
  });
  assert.equal(result.price.askingPricesExcluded, 1);
  assert.ok(result.price.comparables.every((comparable) => comparable.docId !== "asking"));
});

test("price guidance never mixes currencies", async () => {
  await reset();
  await mutate((db) => {
    db.researchDocs.push(
      doc({ id: "gbp", title: "GBP porcelain vase", terms: ["form:vase", "material:porcelain", "keyword:blue"], realisedPrice: 18_000, currency: "GBP" }),
      doc({ id: "usd", title: "USD porcelain vase", terms: ["form:vase", "material:porcelain", "keyword:blue"], realisedPrice: 800_000, currency: "USD" }),
    );
  });
  const result = await researchV2({ query: "blue porcelain vase", categoryId: "ceramics-porcelain", currency: "GBP" });
  assert.equal(result.price.currency, "GBP");
  assert.ok(result.price.comparables.every((comparable) => comparable.currency === "GBP"));
  assert.ok(result.price.mid < 100_000);
});

test("a trusted reference outranks community repetition even with an extreme feedback weight", async () => {
  await reset();
  await mutate((db) => {
    db.researchDocs.push(
      doc({
        id: "reference",
        tier: "reference",
        title: "Museum reference for foo crown",
        terms: ["mark:foo crown", "form:vase", "material:porcelain"],
        realisedPrice: null,
        sourceType: "museum",
        sourceName: "Example museum",
        sourceVerified: true,
      }),
      doc({
        id: "community",
        tier: "community",
        title: "Seller claim for foo crown",
        terms: ["mark:foo crown", "form:vase", "material:porcelain"],
        realisedPrice: null,
        sourceType: "seller",
        weight: 999,
        contributedBy: "seller-spam",
      }),
    );
  });
  const result = await researchV2({ query: "foo crown porcelain vase", signals });
  assert.equal(result.hits[0]?.doc.id, "reference");
  assert.ok((result.hits[0]?.source.trust ?? 0) > (result.hits[1]?.source.trust ?? 1));
});

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
