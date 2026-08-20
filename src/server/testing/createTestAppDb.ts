// In-memory SQLite wired with the real app-db migrations, for integration
// tests only. Never imported by production code — src/server/db/app-client.ts
// owns the real connection singleton.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/app-schema";
import type { AppDb } from "../db/app-client";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../db/app-migrations");

export function createTestAppDb(): AppDb {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    sqlite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }

  return drizzle(sqlite, { schema });
}
