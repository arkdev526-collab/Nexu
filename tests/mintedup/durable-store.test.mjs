import assert from "node:assert/strict";
import test from "node:test";

const { PostgresStateStore } = await import("../../src/mintedup/store-postgres.ts");
const { EMPTY_DATABASE } = await import("../../src/mintedup/store-shared.ts");
const { durableStoreConfigured } = await import("../../src/mintedup/store-config.ts");

const clone = (value) => structuredClone(value);

class FakeDriver {
  row = null;
  schemaCalls = 0;

  async ensureSchema() {
    this.schemaCalls += 1;
  }

  async initialise(payload) {
    if (!this.row) this.row = { revision: 0, payload: clone(payload), updatedAt: new Date().toISOString() };
  }

  async load() {
    return this.row ? clone(this.row) : null;
  }

  async compareAndSwap(expectedRevision, payload) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (!this.row || this.row.revision !== expectedRevision) return null;
    this.row = {
      revision: expectedRevision + 1,
      payload: clone(payload),
      updatedAt: new Date().toISOString(),
    };
    return this.row.revision;
  }
}

test("Postgres store preserves the existing read/mutate contract", async () => {
  const driver = new FakeDriver();
  const store = new PostgresStateStore(driver, { autoMigrate: true });
  await store.mutate((db) => {
    db.applications.push({ id: "a" });
  });
  const ids = await store.read((db) => db.applications.map((entry) => entry.id));
  assert.deepEqual(ids, ["a"]);
  assert.equal(driver.schemaCalls, 1);
});

test("two app instances converge through optimistic revision conflicts", async () => {
  const driver = new FakeDriver();
  const a = new PostgresStateStore(driver, { autoMigrate: true, maxRetries: 8 });
  const b = new PostgresStateStore(driver, { autoMigrate: true, maxRetries: 8 });

  await Promise.all([
    a.mutate(async (db) => {
      await new Promise((resolve) => setTimeout(resolve, 4));
      db.applications.push({ id: "left" });
    }),
    b.mutate(async (db) => {
      await new Promise((resolve) => setTimeout(resolve, 4));
      db.applications.push({ id: "right" });
    }),
  ]);

  const ids = await a.read((db) => db.applications.map((entry) => entry.id).sort());
  assert.deepEqual(ids, ["left", "right"]);
  assert.equal(driver.row.revision, 2);
});

test("snapshot import refuses to overwrite non-empty durable state unless explicitly forced", async () => {
  const driver = new FakeDriver();
  const store = new PostgresStateStore(driver, { autoMigrate: true });
  const first = clone(EMPTY_DATABASE);
  first.applications.push({ id: "existing" });
  await store.replaceSnapshot(first);

  const incoming = clone(EMPTY_DATABASE);
  incoming.applications.push({ id: "incoming" });
  await assert.rejects(store.replaceSnapshot(incoming, { onlyIfEmpty: true }), (error) => error?.status === 409);
  await store.replaceSnapshot(incoming, { onlyIfEmpty: false });
  assert.deepEqual(await store.read((db) => db.applications.map((entry) => entry.id)), ["incoming"]);
});

test("durability cannot be enabled by the old boolean flag alone", () => {
  assert.equal(durableStoreConfigured({ MINTEDUP_DURABLE_STORE: "1" }), false);
  assert.equal(durableStoreConfigured({ MINTEDUP_STORE_BACKEND: "postgres" }), false);
  assert.equal(
    durableStoreConfigured({
      MINTEDUP_STORE_BACKEND: "postgres",
      MINTEDUP_DATABASE_URL: "postgresql://user:secret@example.neon.tech/mintedup",
    }),
    true,
  );
});
