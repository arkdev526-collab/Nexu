import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = path.join(os.tmpdir(), `mintedup-source-library-${process.pid}`);
process.env.MINTEDUP_DATA_DIR = dataDir;
await fs.rm(dataDir, { recursive: true, force: true });

const { mutate, read } = await import("../../src/mintedup/store.ts");
const {
  buildSourceSnapshot,
  createSourceRecord,
  normaliseAuctionEvidence,
  reviewSourceRecord,
} = await import("../../src/mintedup/source-library.ts");
const { ensureVerifiedSourceSeeds } = await import("../../src/mintedup/source-seeds.ts");

async function reset() {
  await mutate((db) => {
    db.users = [];
    db.listings = [];
    db.bids = [];
    db.orders = [];
    db.sessions = [];
    db.researchSessions = [];
    db.researchDocs = [];
    db.sourceRecords = [];
    db.learningEvents = [];
    db.applications = [];
    db.invites = [];
    db.ledger = [];
    db.auctions = [];
  });
}

function auctionInput(overrides = {}) {
  return {
    kind: "auction-lot",
    sourceType: "auction-house",
    sourceName: "Example Auction House",
    sourceUrl: "https://example.com/results/lot-12",
    sourceRecord: "Sale A · Lot 12",
    categoryId: "ceramics-porcelain",
    title: "Blue porcelain vase",
    description: "Verified auction-result metadata for a blue porcelain vase.",
    terms: ["form:vase", "material:porcelain", "motif:blue"],
    dimensions: "Height 30 cm",
    currency: "GBP",
    auction: {
      saleName: "Fine Ceramics",
      saleDate: "2026-01-10T00:00:00.000Z",
      lotNumber: "12",
      hammerPrice: 10_000,
      buyerPremiumRateBps: 2500,
      currency: "GBP",
      sold: true,
      priceNote: "25% buyer premium for the fixture.",
    },
    snapshotExcerpt: "Fixture evidence snapshot.",
    ...overrides,
  };
}

test("auction premium maths derives buyer premium and buyer-total price", () => {
  const evidence = normaliseAuctionEvidence({
    hammerPrice: 10_000,
    buyerPremiumRateBps: 2500,
    currency: "GBP",
    sold: true,
  });
  assert.equal(evidence?.buyerPremiumAmount, 2_500);
  assert.equal(evidence?.buyerTotalPrice, 12_500);
});

test("source snapshots are tamper-evident metadata records", () => {
  const a = buildSourceSnapshot({ url: "https://example.com/object/1", title: "Object", excerpt: "Evidence A", capturedAt: "2026-09-03T00:00:00.000Z" });
  const b = buildSourceSnapshot({ url: "https://example.com/object/1", title: "Object", excerpt: "Evidence B", capturedAt: "2026-09-03T00:00:00.000Z" });
  assert.ok(a?.contentHash);
  assert.notEqual(a?.contentHash, b?.contentHash);
});

test("re-importing the same canonical source is idempotent", async () => {
  await reset();
  const first = await createSourceRecord(auctionInput(), "curator-1");
  const second = await createSourceRecord(auctionInput(), "curator-1");
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.record.id, second.record.id);
  const count = await read((db) => db.sourceRecords.length);
  assert.equal(count, 1);
});

test("verification publishes a premium-inclusive auction record into research", async () => {
  await reset();
  const created = await createSourceRecord(auctionInput(), "curator-1");
  const verified = await reviewSourceRecord(created.record.id, "verify", "curator-2");
  assert.equal(verified.reviewStatus, "verified");
  const state = await read((db) => ({
    record: db.sourceRecords.find((record) => record.id === created.record.id),
    doc: db.researchDocs.find((doc) => doc.sourceRecordId === created.record.id),
  }));
  assert.equal(state.record?.realisedPrice, 12_500);
  assert.equal(state.doc?.realisedPrice, 12_500);
  assert.equal(state.doc?.buyerTotalPrice, 12_500);
  assert.equal(state.doc?.hammerPrice, 10_000);
  assert.equal(state.doc?.realisedPriceBasis, "buyer-total");
  assert.equal(state.doc?.sourceVerified, true);
});

test("hammer-only auction evidence is searchable but excluded from buyer-total valuation", async () => {
  await reset();
  const input = auctionInput({
    sourceUrl: "https://example.com/results/hammer-only",
    sourceRecord: "Sale B · Lot 8",
    auction: {
      saleName: "Fine Ceramics",
      saleDate: "2026-01-11T00:00:00.000Z",
      lotNumber: "8",
      hammerPrice: 10_000,
      currency: "GBP",
      sold: true,
      priceNote: "Hammer disclosed; buyer premium not disclosed.",
    },
  });
  const created = await createSourceRecord(input, "curator-1");
  await reviewSourceRecord(created.record.id, "verify", "curator-2");
  const doc = await read((db) => db.researchDocs.find((candidate) => candidate.sourceRecordId === created.record.id));
  assert.equal(doc?.hammerPrice, 10_000);
  assert.equal(doc?.buyerTotalPrice, null);
  assert.equal(doc?.realisedPrice, null);
});

test("official starter pack installs four traceable verified records without duplicating", async () => {
  await reset();
  await ensureVerifiedSourceSeeds();
  await ensureVerifiedSourceSeeds();
  const state = await read((db) => ({
    records: db.sourceRecords,
    sourceDocs: db.researchDocs.filter((doc) => doc.sourceRecordId),
  }));
  assert.equal(state.records.length, 4);
  assert.equal(state.sourceDocs.length, 4);
  assert.equal(state.records.filter((record) => record.sourceType === "museum").length, 2);
  assert.equal(state.records.filter((record) => record.sourceType === "auction-house").length, 2);
  assert.equal(state.records.filter((record) => record.realisedPrice).length, 2);
  assert.ok(state.records.every((record) => record.reviewStatus === "verified"));
  assert.ok(state.records.every((record) => record.sourceUrl.startsWith("https://")));
});

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
