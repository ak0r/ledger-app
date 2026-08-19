import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./registry-schema";

// Connection singleton for the Family registry — a separate database from
// any Family's isolated financial dataset (docs/v9-delta/family-concept-
// contract.md §5: "Family selection happens above the financial database").
const REGISTRY_DIR = process.env.LEDGER_DATA_DIR ?? path.join(process.cwd(), "data");
const REGISTRY_PATH = path.join(REGISTRY_DIR, "registry.db");

// process.cwd()-relative but not a compile-time constant from Turbopack's
// point of view — this is a one-time local directory check, not a dynamic
// import/glob, so opting out of its whole-project tracing heuristic is safe.
if (!existsSync(/* turbopackIgnore: true */ REGISTRY_DIR)) {
  mkdirSync(/* turbopackIgnore: true */ REGISTRY_DIR, { recursive: true });
}

const sqlite = new Database(REGISTRY_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const registryDb = drizzle(sqlite, { schema });

export type RegistryDb = typeof registryDb;
export type RegistryDbOrTx = RegistryDb | Parameters<Parameters<RegistryDb["transaction"]>[0]>[0];
