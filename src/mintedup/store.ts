import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Database } from "./types";

/**
 * File-backed JSON store.
 *
 * This is deliberately the smallest thing that gives Minted Up real,
 * persistent, transactional-enough state. Every read goes through `read()` and
 * every write through `mutate()`, so swapping the two functions for Postgres,
 * SQLite or Prisma later is a contained change — nothing above this file
 * touches the filesystem. See docs/mintedup/architecture.md.
 */

const DATA_DIR = process.env.MINTEDUP_DATA_DIR
  ? path.resolve(process.env.MINTEDUP_DATA_DIR)
  : path.join(process.cwd(), ".data", "mintedup");

const DB_FILE = path.join(DATA_DIR, "db.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const EMPTY: Database = {
  users: [],
  listings: [],
  bids: [],
  orders: [],
  sessions: [],
  researchSessions: [],
  researchDocs: [],
  learningEvents: [],
};

type Cache = { db: Database | null; queue: Promise<unknown> };

// Next.js reloads modules in dev; hang the cache off globalThis so the write
// queue is not silently forked into two competing serialisers.
const globalCache = globalThis as typeof globalThis & {
  __mintedUpStore?: Cache;
};

const cache: Cache = (globalCache.__mintedUpStore ??= {
  db: null,
  queue: Promise.resolve(),
});

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

async function load(): Promise<Database> {
  if (cache.db) return cache.db;
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    // Spread over EMPTY so a db.json written by an older schema still loads.
    cache.db = { ...EMPTY, ...(JSON.parse(raw) as Partial<Database>) };
  } catch {
    cache.db = structuredClone(EMPTY);
  }
  return cache.db;
}

async function persist(db: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Write-then-rename: a crash mid-write leaves the previous db.json intact.
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

/** Read-only view of the database. Do not mutate the result — use `mutate`. */
export async function read<T>(fn: (db: Database) => T): Promise<T> {
  const db = await load();
  return fn(db);
}

/**
 * Serialised read-modify-write. Callers mutate the draft and return a value;
 * the file is rewritten once the callback resolves. Every write in the process
 * queues behind the previous one, so two concurrent bids cannot interleave.
 */
export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = cache.queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  // Keep the chain alive even when this particular write throws.
  cache.queue = run.catch(() => undefined);
  return run;
}

export async function saveUpload(id: string, ext: string, bytes: Buffer): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${id}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return filename;
}

export async function readUpload(filename: string): Promise<Buffer | null> {
  // Defend the upload directory against traversal in the [filename] route.
  if (!/^[A-Za-z0-9_.-]+$/.test(filename) || filename.includes("..")) return null;
  try {
    return await fs.readFile(path.join(UPLOAD_DIR, filename));
  } catch {
    return null;
  }
}
