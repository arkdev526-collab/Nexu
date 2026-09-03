import type { Database } from "./types";
import {
  databaseIsEmpty,
  EMPTY_DATABASE,
  invalidateDerivedResearchCaches,
  normaliseDatabase,
} from "./store-shared";

export type DurableStateRow = {
  revision: number;
  payload: Database;
  updatedAt: string | null;
};

export interface DurableStateDriver {
  ensureSchema(): Promise<void>;
  initialise(payload: Database): Promise<void>;
  load(): Promise<DurableStateRow | null>;
  compareAndSwap(expectedRevision: number, payload: Database): Promise<number | null>;
}

export class DurableStoreError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = "DurableStoreError";
  }
}

export class DurableStoreConflictError extends DurableStoreError {
  constructor() {
    super("Minted Up storage was busy. Please retry the operation.", 409);
    this.name = "DurableStoreConflictError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PostgresStateStore {
  private preparation: Promise<void> | null = null;

  constructor(
    private readonly driver: DurableStateDriver,
    private readonly options: { autoMigrate?: boolean; maxRetries?: number } = {},
  ) {}

  private async prepare(): Promise<void> {
    if (!this.preparation) {
      this.preparation = (async () => {
        if (this.options.autoMigrate) await this.driver.ensureSchema();
        await this.driver.initialise(structuredClone(EMPTY_DATABASE));
      })().catch((error) => {
        this.preparation = null;
        if (error instanceof DurableStoreError) throw error;
        throw new DurableStoreError(
          `Postgres state is not ready. Run the Minted Up database migration first. ${error instanceof Error ? error.message : ""}`.trim(),
        );
      });
    }
    await this.preparation;
  }

  async read<T>(fn: (db: Database) => T): Promise<T> {
    await this.prepare();
    const row = await this.driver.load();
    if (!row) throw new DurableStoreError("Minted Up Postgres state row is missing.");
    return fn(normaliseDatabase(row.payload));
  }

  /**
   * Cross-instance writes use optimistic compare-and-swap on a monotonically
   * increasing revision. The callback may be replayed after a conflict, so
   * mutate callbacks must only derive their result from the supplied draft and
   * must not perform irreversible external side effects.
   */
  async mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    await this.prepare();
    const maxRetries = Math.max(1, Math.min(12, this.options.maxRetries ?? 8));

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const row = await this.driver.load();
      if (!row) throw new DurableStoreError("Minted Up Postgres state row is missing.");
      const draft = structuredClone(normaliseDatabase(row.payload));
      const result = await fn(draft);
      const revision = await this.driver.compareAndSwap(row.revision, draft);
      if (revision !== null) {
        invalidateDerivedResearchCaches();
        return result;
      }
      await sleep(Math.min(40, 3 * 2 ** attempt));
    }

    throw new DurableStoreConflictError();
  }

  async status() {
    await this.prepare();
    const row = await this.driver.load();
    return {
      ready: Boolean(row),
      revision: row?.revision ?? null,
      updatedAt: row?.updatedAt ?? null,
      empty: row ? databaseIsEmpty(normaliseDatabase(row.payload)) : true,
    };
  }

  async replaceSnapshot(snapshot: unknown, options: { onlyIfEmpty?: boolean } = {}) {
    await this.prepare();
    const incoming = normaliseDatabase(snapshot);
    const maxRetries = Math.max(1, Math.min(12, this.options.maxRetries ?? 8));

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const row = await this.driver.load();
      if (!row) throw new DurableStoreError("Minted Up Postgres state row is missing.");
      if (options.onlyIfEmpty && !databaseIsEmpty(normaliseDatabase(row.payload))) {
        throw new DurableStoreError("Postgres state is not empty; refusing to overwrite it.", 409);
      }
      const revision = await this.driver.compareAndSwap(row.revision, incoming);
      if (revision !== null) {
        invalidateDerivedResearchCaches();
        return { revision };
      }
      await sleep(Math.min(40, 3 * 2 ** attempt));
    }

    throw new DurableStoreConflictError();
  }
}

type NeonRows = Record<string, unknown>[];
type NeonClient = { query(text: string, params?: unknown[]): Promise<NeonRows> };
type NeonModule = { neon(connectionString: string): NeonClient };

async function loadNeonModule(): Promise<NeonModule> {
  // Kept dynamic so the existing branch continues to build before the runtime
  // driver is installed during Postgres cutover. The module name is fixed and
  // never derived from user input.
  const packageName: string = ["@neondatabase", "serverless"].join("/");
  try {
    const loaded = (await import(/* webpackIgnore: true */ packageName)) as unknown as NeonModule;
    if (typeof loaded.neon !== "function") throw new Error("neon() export not found");
    return loaded;
  } catch (error) {
    throw new DurableStoreError(
      `Postgres backend requires @neondatabase/serverless. Install version 1.1.0 before enabling MINTEDUP_STORE_BACKEND=postgres. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }
}

function asIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function createNeonStateDriver(connectionString: string): DurableStateDriver {
  let clientPromise: Promise<NeonClient> | null = null;
  const client = async () => {
    clientPromise ??= loadNeonModule().then((module) => module.neon(connectionString));
    return clientPromise;
  };

  return {
    async ensureSchema() {
      const sql = await client();
      await sql.query(`
        CREATE TABLE IF NOT EXISTS mintedup_state (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          revision BIGINT NOT NULL DEFAULT 0,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    },

    async initialise(payload) {
      const sql = await client();
      await sql.query(
        "INSERT INTO mintedup_state (id, payload, revision) VALUES (1, $1::jsonb, 0) ON CONFLICT (id) DO NOTHING",
        [JSON.stringify(payload)],
      );
    },

    async load() {
      const sql = await client();
      const rows = await sql.query("SELECT revision, payload, updated_at FROM mintedup_state WHERE id = 1");
      const row = rows[0];
      if (!row) return null;
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      return {
        revision: Number(row.revision),
        payload: normaliseDatabase(payload),
        updatedAt: asIso(row.updated_at),
      };
    },

    async compareAndSwap(expectedRevision, payload) {
      const sql = await client();
      const rows = await sql.query(
        "UPDATE mintedup_state SET payload = $1::jsonb, revision = revision + 1, updated_at = now() WHERE id = 1 AND revision = $2 RETURNING revision",
        [JSON.stringify(payload), expectedRevision],
      );
      return rows.length ? Number(rows[0].revision) : null;
    },
  };
}

export function createPostgresStateStore(input: {
  connectionString: string;
  autoMigrate?: boolean;
  maxRetries?: number;
  driver?: DurableStateDriver;
}) {
  return new PostgresStateStore(input.driver ?? createNeonStateDriver(input.connectionString), {
    autoMigrate: input.autoMigrate,
    maxRetries: input.maxRetries,
  });
}
