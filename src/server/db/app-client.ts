import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./app-schema";

// Connection singleton for the application-level database — separate from
// any Family's isolated financial dataset (2026-08-19 Family/Application
// Architecture delta: "Family selection happens above the financial
// database").
const APP_DIR = process.env.LEDGER_DATA_DIR ?? path.join(process.cwd(), "data");
const APP_PATH = path.join(APP_DIR, "app.db");

// process.cwd()-relative but not a compile-time constant from Turbopack's
// point of view — this is a one-time local directory check, not a dynamic
// import/glob, so opting out of its whole-project tracing heuristic is safe.
if (!existsSync(/* turbopackIgnore: true */ APP_DIR)) {
  mkdirSync(/* turbopackIgnore: true */ APP_DIR, { recursive: true });
}

const sqlite = new Database(APP_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const appDb = drizzle(sqlite, { schema });

// Deliberately no in-process migrate() call here (unlike family-client.ts's
// per-familyId openConnection, which is lazy/keyed and safe to migrate on
// every call). This module is a shared singleton imported at build time by
// many parallel workers (`next build`'s page-data-collection phase spins up
// ~15 concurrent processes) — an eager top-level migrate() here races
// multiple processes' read-then-write "is this migration applied?" checks
// against the same physical file, producing a genuine "table already
// exists" crash (reproduced via `pnpm build`, not a hypothetical). Run
// `pnpm db:app:migrate` explicitly instead, same as this file's original
// (pre-delta) registry-client.ts behavior.
export type AppDb = typeof appDb;
export type AppDbOrTx = AppDb | Parameters<Parameters<AppDb["transaction"]>[0]>[0];
