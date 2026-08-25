import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Connection singleton for the whole Hosted Instance (2026-08-20 User
// Simplification delta) — one physical SQLite file for the entire app:
// AppUser, Session, Profile, Account, Transaction, Postings, Currency all
// live here. Replaces the per-Family isolated-DB model (deleted
// family-client.ts) and yesterday's separate small app.db (deleted
// app-client.ts/app-schema.ts) — "1 Hosted Instance -> 1 database".
const DATA_DIR = process.env.LEDGER_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ledger.db");

// process.cwd()-relative but not a compile-time constant from Turbopack's
// point of view — this is a one-time local directory check, not a dynamic
// import/glob, so opting out of its whole-project tracing heuristic is safe.
if (!existsSync(/* turbopackIgnore: true */ DATA_DIR)) {
  mkdirSync(/* turbopackIgnore: true */ DATA_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Deliberately no in-process migrate() call — `next build`'s ~15 parallel
// page-data-collection workers race an eager top-level migrate() against
// the same file (reproduced via a real `pnpm build` failure and reverted
// 2026-08-19, when this exact module was still called app-client.ts). Run
// `pnpm db:migrate` explicitly instead. DO NOT reintroduce eager migrate.
export type Db = typeof db;
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
