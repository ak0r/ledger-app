// In-memory SQLite wired with the real registry migrations, for integration
// tests only. Never imported by production code — src/server/db/registry-
// client.ts owns the real connection singleton.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/registry-schema";
import type { RegistryDb } from "../db/registry-client";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../db/registry-migrations");

export function createTestRegistryDb(): RegistryDb {
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
