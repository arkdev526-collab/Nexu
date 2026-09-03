import process from "node:process";

const command = process.argv[2] ?? "status";
const force = process.argv.includes("--force");
const fileFlag = process.argv.find((arg) => arg.startsWith("--file="));
const file = fileFlag ? fileFlag.slice("--file=".length) : undefined;

const store = await import("../src/mintedup/store.ts");

if (command === "status") {
  console.log(JSON.stringify(await store.storageStatus(), null, 2));
  process.exit(0);
}

if (command === "migrate") {
  const { createPostgresStateStore } = await import("../src/mintedup/store-postgres.ts");
  const { postgresConnectionString } = await import("../src/mintedup/store-config.ts");
  const connectionString = postgresConnectionString();
  if (!connectionString) throw new Error("Set MINTEDUP_DATABASE_URL, DATABASE_URL or POSTGRES_URL first.");
  const postgres = createPostgresStateStore({ connectionString, autoMigrate: true });
  console.log(JSON.stringify(await postgres.status(), null, 2));
  process.exit(0);
}

if (command === "import") {
  const result = await store.migrateFileSnapshotToPostgres({ file, force });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

throw new Error(`Unknown command: ${command}. Use status, migrate or import.`);
