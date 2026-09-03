export type MintedUpStoreBackend = "file" | "postgres";

export function configuredStoreBackend(env: NodeJS.ProcessEnv = process.env): MintedUpStoreBackend {
  return env.MINTEDUP_STORE_BACKEND === "postgres" ? "postgres" : "file";
}

export function postgresConnectionString(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.MINTEDUP_DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "postgres:" || url.protocol === "postgresql:" ? raw : null;
  } catch {
    return null;
  }
}

export function postgresAutoMigrate(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MINTEDUP_POSTGRES_AUTO_MIGRATE === "1";
}

/**
 * A durable store is real only when the application is explicitly configured
 * for Postgres and a valid connection string is present. A legacy boolean flag
 * is deliberately ignored so a deployment cannot claim durability by mistake.
 */
export function durableStoreConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return configuredStoreBackend(env) === "postgres" && Boolean(postgresConnectionString(env));
}

export function storeConfigSummary(env: NodeJS.ProcessEnv = process.env) {
  const backend = configuredStoreBackend(env);
  const hasConnectionString = Boolean(postgresConnectionString(env));
  return {
    backend,
    durable: backend === "postgres" && hasConnectionString,
    hasConnectionString,
    autoMigrate: postgresAutoMigrate(env),
  } as const;
}
