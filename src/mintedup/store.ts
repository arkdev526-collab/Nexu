import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Database } from "./types";
import {
  configuredStoreBackend,
  postgresAutoMigrate,
  postgresConnectionString,
  storeConfigSummary,
} from "./store-config";
import { createPostgresStateStore, DurableStoreError } from "./store-postgres";
import {
  EMPTY_DATABASE,
  invalidateDerivedResearchCaches,
  normaliseDatabase,
} from "./store-shared";
import { uploadStorageStatus } from "./upload-storage";

const DATA_DIR = process.env.MINTEDUP_DATA_DIR
  ? path.resolve(process.env.MINTEDUP_DATA_DIR)
  : path.join(process.cwd(), ".data", "mintedup");

const DB_FILE = path.join(DATA_DIR, "db.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

type FileCache = { db: Database | null; queue: Promise<unknown> };
const globalCache = globalThis as typeof globalThis & {
  __mintedUpFileStore?: FileCache;
  __mintedUpPostgresStore?: ReturnType<typeof createPostgresStateStore>;
};
const fileCache: FileCache = (globalCache.__mintedUpFileStore ??= {
  db: null,
  queue: Promise.resolve(),
});

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

async function loadFile(): Promise<Database> {
  if (fileCache.db) return fileCache.db;
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    fileCache.db = normaliseDatabase(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    fileCache.db = structuredClone(EMPTY_DATABASE);
  }
  return fileCache.db;
}

async function persistFile(db: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

function postgresStore() {
  if (globalCache.__mintedUpPostgresStore) return globalCache.__mintedUpPostgresStore;
  const connectionString = postgresConnectionString();
  if (!connectionString) {
    throw new DurableStoreError(
      "MINTEDUP_STORE_BACKEND=postgres is set, but no valid MINTEDUP_DATABASE_URL, DATABASE_URL or POSTGRES_URL is configured.",
    );
  }
  globalCache.__mintedUpPostgresStore = createPostgresStateStore({
    connectionString,
    autoMigrate: postgresAutoMigrate(),
  });
  return globalCache.__mintedUpPostgresStore;
}

export async function read<T>(fn: (db: Database) => T): Promise<T> {
  if (configuredStoreBackend() === "postgres") return postgresStore().read(fn);
  const db = await loadFile();
  return fn(db);
}

export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  if (configuredStoreBackend() === "postgres") return postgresStore().mutate(fn);

  const run = fileCache.queue.then(async () => {
    const current = await loadFile();
    const draft = structuredClone(current);
    const result = await fn(draft);
    await persistFile(draft);
    fileCache.db = draft;
    invalidateDerivedResearchCaches();
    return result;
  });
  fileCache.queue = run.catch(() => undefined);
  return run;
}

export async function storageStatus(): Promise<{
  backend: "file" | "postgres";
  durable: boolean;
  configured: boolean;
  ready: boolean;
  revision: number | null;
  updatedAt: string | null;
  autoMigrate: boolean;
  uploadBackend: "file" | "r2";
  uploadsConfigured: boolean;
  uploadsReady: boolean;
  uploadsDurable: boolean;
  uploadMessage: string;
  message: string;
}> {
  const config = storeConfigSummary();
  const uploads = uploadStorageStatus();
  const uploadFields = {
    uploadBackend: uploads.backend,
    uploadsConfigured: uploads.configured,
    uploadsReady: uploads.ready,
    uploadsDurable: uploads.durable,
    uploadMessage: uploads.detail,
  };

  if (config.backend === "file") {
    let updatedAt: string | null = null;
    try {
      updatedAt = (await fs.stat(DB_FILE)).mtime.toISOString();
    } catch {
      // No file yet is a valid empty local-development state.
    }
    return {
      backend: "file",
      durable: false,
      configured: true,
      ready: true,
      revision: null,
      updatedAt,
      autoMigrate: false,
      ...uploadFields,
      message: "Local file store is active. Suitable for development only.",
    };
  }

  if (!config.hasConnectionString) {
    return {
      backend: "postgres",
      durable: false,
      configured: false,
      ready: false,
      revision: null,
      updatedAt: null,
      autoMigrate: config.autoMigrate,
      ...uploadFields,
      message: "Postgres backend selected but no valid connection string is configured.",
    };
  }

  try {
    const status = await postgresStore().status();
    return {
      backend: "postgres",
      durable: true,
      configured: true,
      ready: status.ready,
      revision: status.revision,
      updatedAt: status.updatedAt,
      autoMigrate: config.autoMigrate,
      ...uploadFields,
      message: status.ready
        ? uploads.ready
          ? "Shared Postgres state is active. Durable listing-image storage is also configured."
          : "Shared Postgres state is active. Listing-image storage is not production-ready yet."
        : "Postgres is configured but the Minted Up state row is unavailable.",
    };
  } catch (error) {
    return {
      backend: "postgres",
      durable: true,
      configured: true,
      ready: false,
      revision: null,
      updatedAt: null,
      autoMigrate: config.autoMigrate,
      ...uploadFields,
      message: error instanceof Error ? error.message : "Postgres health check failed.",
    };
  }
}

export async function migrateFileSnapshotToPostgres(input: {
  file?: string;
  connectionString?: string;
  force?: boolean;
}) {
  const filename = input.file ? path.resolve(input.file) : DB_FILE;
  const raw = await fs.readFile(filename, "utf8");
  const snapshot = normaliseDatabase(JSON.parse(raw));
  const connectionString = input.connectionString ?? postgresConnectionString();
  if (!connectionString) {
    throw new DurableStoreError("A Postgres connection string is required for migration.");
  }
  const store = createPostgresStateStore({ connectionString, autoMigrate: true });
  const result = await store.replaceSnapshot(snapshot, { onlyIfEmpty: !input.force });
  return { ...result, sourceFile: filename };
}

function safeUploadName(filename: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(filename) && !filename.includes("..");
}

/** Local-development upload path. Production images use durable object storage. */
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
