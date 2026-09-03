import type { Database } from "./types";

export const EMPTY_DATABASE: Database = {
  users: [],
  listings: [],
  bids: [],
  orders: [],
  sessions: [],
  researchSessions: [],
  researchDocs: [],
  sourceRecords: [],
  learningEvents: [],
  applications: [],
  invites: [],
  ledger: [],
  auctions: [],
};

const ARRAY_KEYS = Object.keys(EMPTY_DATABASE) as (keyof Database)[];

/** Backwards-compatible normalisation for file snapshots and JSONB rows. */
export function normaliseDatabase(value: unknown): Database {
  const raw = value && typeof value === "object" ? (value as Partial<Database>) : {};
  const db = structuredClone(EMPTY_DATABASE);
  for (const key of ARRAY_KEYS) {
    const candidate = raw[key];
    if (Array.isArray(candidate)) {
      (db[key] as unknown[]) = structuredClone(candidate);
    }
  }
  return db;
}

export function databaseIsEmpty(db: Database): boolean {
  return ARRAY_KEYS.every((key) => db[key].length === 0);
}

type DerivedResearchCaches = typeof globalThis & {
  __mintedUpIndex?: unknown;
  __mintedUpResearchV2Index?: unknown;
};

export function invalidateDerivedResearchCaches(): void {
  const derived = globalThis as DerivedResearchCaches;
  derived.__mintedUpIndex = undefined;
  derived.__mintedUpResearchV2Index = undefined;
}
