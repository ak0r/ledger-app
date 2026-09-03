// In-memory SQLite wired with the real migrations, for integration tests
// only. Never imported by production code — src/server/db/client.ts owns
// the real connection singleton.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import type { Db } from "../db/client";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../db/migrations");

function createMigratedSqlite(): InstanceType<typeof Database> {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }

  return sqlite;
}

export function createTestDb(): Db {
  return drizzle(createMigratedSqlite(), { schema });
}

// Same in-memory database, raw handle and Drizzle wrapper both — for the
// handful of use-cases (reset.ts, backups.ts) that need the raw
// better-sqlite3 client alongside `Db` and must operate on the exact same
// connection (e.g. toggling a pragma the deletes then rely on).
export function createTestDbWithRaw(): { db: Db; sqlite: InstanceType<typeof Database> } {
  const sqlite = createMigratedSqlite();
  return { db: drizzle(sqlite, { schema }), sqlite };
}
