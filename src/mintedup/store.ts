import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Database } from "./types";

const DATA_DIR = process.env.MINTEDUP_DATA_DIR
  ? path.resolve(process.env.MINTEDUP_DATA_DIR)
  : path.join(process.cwd(), ".data", "mintedup");

const DB_FILE = path.join(DATA_DIR, "db.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const EMPTY: Database = {
  users: [], listings: [], bids: [], orders: [], sessions: [], researchSessions: [],
  researchDocs: [], learningEvents: [], applications: [], invites: [], ledger: [], auctions: [],
};

type Cache = { db: Database | null; queue: Promise<unknown> };
const globalCache = globalThis as typeof globalThis & { __mintedUpStore?: Cache };
const cache: Cache = (globalCache.__mintedUpStore ??= { db: null, queue: Promise.resolve() });

type DerivedResearchCaches = typeof globalThis & {
  __mintedUpIndex?: unknown;
  __mintedUpResearchV2Index?: unknown;
};

function invalidateDerivedCaches(): void {
  const derived = globalThis as DerivedResearchCaches;
  derived.__mintedUpIndex = undefined;
  derived.__mintedUpResearchV2Index = undefined;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

async function load(): Promise<Database> {
  if (cache.db) return cache.db;
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    cache.db = { ...EMPTY, ...(JSON.parse(raw) as Partial<Database>) };
  } catch {
    cache.db = structuredClone(EMPTY);
  }
  return cache.db;
}

async function persist(db: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

export async function read<T>(fn: (db: Database) => T): Promise<T> {
  const db = await load();
  return fn(db);
}

export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = cache.queue.then(async () => {
    const current = await load();
    const draft = structuredClone(current);
    const result = await fn(draft);
    await persist(draft);
    cache.db = draft;
    // Research indexes are derived state. Any successful database mutation can
    // change source metadata, terms, feedback or prices without changing row
    // count, so invalidate rather than trying to guess whether a signature is
    // still safe. Production DB search/indexing will replace this prototype.
    invalidateDerivedCaches();
    return result;
  });
  cache.queue = run.catch(() => undefined);
  return run;
}

function safeUploadName(filename: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(filename) && !filename.includes("..");
}

export async function saveUpload(id: string, ext: string, bytes: Buffer): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${id}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return filename;
}

export async function deleteUpload(filename: string): Promise<void> {
  if (!safeUploadName(filename)) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIR, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function readUpload(filename: string): Promise<Buffer | null> {
  if (!safeUploadName(filename)) return null;
  try {
    return await fs.readFile(path.join(UPLOAD_DIR, filename));
  } catch {
    return null;
  }
}
