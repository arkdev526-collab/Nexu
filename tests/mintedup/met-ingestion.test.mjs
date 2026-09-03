import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = path.join(os.tmpdir(), `mintedup-met-ingestion-${process.pid}`);
process.env.MINTEDUP_DATA_DIR = dataDir;
await fs.rm(dataDir, { recursive: true, force: true });

const { mutate, read } = await import("../../src/mintedup/store.ts");
const { fetchMetObject, getMetProfile, metObjectToSourceInput } = await import("../../src/mintedup/source-adapters/met.ts");
const { runMetIngestion, scheduledIngestionGate } = await import("../../src/mintedup/ingestion.ts");

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

function metObject(overrides = {}) {
  return {
    objectID: 100,
    isPublicDomain: true,
    accessionNumber: "26.1.1",
    department: "Asian Art",
    objectName: "Vase",
    title: "Porcelain vase with dragon decoration",
    culture: "China",
    dynasty: "Qing dynasty (1644–1911)",
    reign: "Qianlong period (1736–95)",
    objectDate: "18th century",
    medium: "Porcelain with underglaze blue decoration",
    dimensions: "H. 38 cm",
    classification: "Ceramics",
    country: "China",
    objectURL: "https://www.metmuseum.org/art/collection/search/100",
    tags: [{ term: "Dragons" }, { term: "Vases" }],
    ...overrides,
  };
}

function fixtureFetch(objects) {
  return async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/search")) {
      return new Response(JSON.stringify({ total: Object.keys(objects).length, objectIDs: Object.keys(objects).map(Number) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const id = Number(url.pathname.split("/").at(-1));
    const object = objects[id];
    return object
      ? new Response(JSON.stringify(object), { status: 200, headers: { "content-type": "application/json" } })
      : new Response("not found", { status: 404 });
  };
}

test("Met mapping keeps only public-domain records and emits typed physical evidence", () => {
  const profile = getMetProfile("qing-porcelain");
  const mapped = metObjectToSourceInput(metObject(), profile);
  assert.ok(mapped);
  assert.equal(mapped.sourceType, "museum");
  assert.equal(mapped.sourceRecord, "26.1.1");
  assert.equal(mapped.categoryId, "ceramics-porcelain");
  assert.ok(mapped.terms.some((term) => term.startsWith("form:Vase")));
  assert.ok(mapped.terms.some((term) => term.startsWith("material:Porcelain")));
  assert.equal(metObjectToSourceInput(metObject({ isPublicDomain: false }), profile), null);
});

test("Met fetch retries throttling responses before succeeding", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
    return new Response(JSON.stringify(metObject()), { status: 200, headers: { "content-type": "application/json" } });
  };
  const object = await fetchMetObject(100, { fetchImpl, sleep: async () => {}, maxAttempts: 2 });
  assert.equal(calls, 2);
  assert.equal(object?.objectID, 100);
});

test("manual ingestion creates review drafts and a repeat run is idempotent", async () => {
  await reset();
  const fetchImpl = fixtureFetch({
    100: metObject(),
    101: metObject({ objectID: 101, accessionNumber: "26.1.2", objectURL: "https://www.metmuseum.org/art/collection/search/101", isPublicDomain: false }),
  });
  const first = await runMetIngestion({
    profileId: "qing-porcelain",
    actorId: "curator-1",
    trigger: "manual",
    limit: 4,
    fetchImpl,
    sleep: async () => {},
    interRequestMs: 0,
  });
  assert.equal(first.created, 1);
  const second = await runMetIngestion({
    profileId: "qing-porcelain",
    actorId: "curator-1",
    trigger: "manual",
    limit: 4,
    fetchImpl,
    sleep: async () => {},
    interRequestMs: 0,
  });
  assert.equal(second.created, 0);
  assert.equal(second.duplicates, 1);
  const records = await read((db) => db.sourceRecords);
  assert.equal(records.length, 1);
  assert.equal(records[0].reviewStatus, "draft");
  assert.equal(records[0].researchDocId, null);
});

test("dry-run reports new evidence without mutating the Source Library and cron is safe-gated", async () => {
  await reset();
  const fetchImpl = fixtureFetch({ 100: metObject() });
  const result = await runMetIngestion({
    profileId: "qing-porcelain",
    actorId: "curator-1",
    trigger: "manual",
    dryRun: true,
    fetchImpl,
    sleep: async () => {},
    interRequestMs: 0,
  });
  assert.equal(result.created, 1);
  assert.equal(await read((db) => db.sourceRecords.length), 0);
  assert.equal(scheduledIngestionGate({}).enabled, false);
  assert.equal(scheduledIngestionGate({ MINTEDUP_ENABLE_SCHEDULED_INGESTION: "1", MINTEDUP_CRON_PRIMARY: "1" }).enabled, false);
  assert.equal(scheduledIngestionGate({ MINTEDUP_ENABLE_SCHEDULED_INGESTION: "1", MINTEDUP_CRON_PRIMARY: "1", MINTEDUP_DURABLE_STORE: "1" }).enabled, false);
  assert.equal(scheduledIngestionGate({
    MINTEDUP_ENABLE_SCHEDULED_INGESTION: "1",
    MINTEDUP_CRON_PRIMARY: "1",
    MINTEDUP_STORE_BACKEND: "postgres",
    MINTEDUP_DATABASE_URL: "postgresql://user:secret@example.neon.tech/mintedup",
  }).enabled, true);
});

test.after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
