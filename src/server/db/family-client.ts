// Resolves a Family's isolated financial database
// (docs/v9-delta/family-concept-contract.md). Each Family gets its own
// SQLite file at a deterministic path — there is no `family_id` column
// anywhere; isolation is physical, one file per Family.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const DATA_DIR = process.env.LEDGER_DATA_DIR ?? path.join(process.cwd(), "data");
const FAMILIES_DIR = path.join(DATA_DIR, "families");
// process.cwd()-relative, not import.meta.dirname-relative: this app always
// runs from the project root (dev/start scripts), and import.meta.dirname
// doesn't survive Turbopack's server bundling for production code (it's
// only safe in test files run directly under vitest, like createTestDb.ts).
const MIGRATIONS_DIR = path.join(process.cwd(), "src/server/db/migrations");

const cache = new Map<string, Db>();

export class FamilyDatasetNotFoundError extends Error {
  constructor(familyId: string) {
    super(`Family dataset not found for id: ${familyId}`);
    this.name = "FamilyDatasetNotFoundError";
  }
}

export function familyDbPath(familyId: string): string {
  return path.join(FAMILIES_DIR, `${familyId}.db`);
}

// Every Family database provisioned before this fix was created by the old
// raw-`sqlite.exec`-per-file mechanism, which never wrote Drizzle's own
// `__drizzle_migrations` journal table — so, unpatched, Drizzle's migrator
// would think no migration had ever run and try to replay `CREATE TABLE`
// from scratch against tables that already exist. Detect that one-time
// legacy shape (real tables present, no journal table yet) and backfill the
// journal to say "everything through the newest migration that already
// existed at the time this fix shipped is already applied" — using the
// exact hash/timestamp format Drizzle's own migrator writes (readMigrationFiles
// in drizzle-orm/migrator.js: sha256 of the migration file's contents,
// `journalEntry.when` as the timestamp) — so it correctly applies only
// anything genuinely new from here on. A brand-new (empty) database has no
// tables yet, so this is a no-op for it; Drizzle's migrator handles that
// case on its own.
function backfillLegacyMigrationJournal(sqlite: Database.Database): void {
  const hasAnyUserTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1")
    .get();
  if (!hasAnyUserTable) return;

  const hasJournalTable = sqlite
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations' LIMIT 1",
    )
    .get();
  // The journal table may already exist but be empty — e.g. Drizzle's own
  // migrator creates it (CREATE TABLE IF NOT EXISTS, outside its own
  // transaction) even on a run that then fails and rolls back the actual
  // migration attempt. Table-existence alone isn't enough; only a
  // populated journal means this database is genuinely already tracked.
  if (hasJournalTable) {
    const hasRow = sqlite.prepare('SELECT 1 FROM "__drizzle_migrations" LIMIT 1').get();
    if (hasRow) return;
  }

  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string; when: number }[] };
  const latest = journal.entries.at(-1);
  if (!latest) return;

  const sql = readFileSync(path.join(MIGRATIONS_DIR, `${latest.tag}.sql`), "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  sqlite
    .prepare(`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)`)
    .run(hash, latest.when);
}

// Applies any migration not yet recorded in this database's own
// `__drizzle_migrations` journal table (Drizzle's own sync migrator for
// better-sqlite3 — the same mechanism `pnpm db:migrate`/`db:registry:migrate`
// already use via the CLI, just wired in-process here). Safe to call on
// every open: a fully-caught-up database is a no-op. This is what lets a
// schema change reach every already-provisioned Family database, not just
// brand-new ones — there is no other catch-up path since `getFamilyDb`
// never used to run migrations at all.
function openConnection(filePath: string): Db {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  backfillLegacyMigrationJournal(sqlite);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

// Read path — used everywhere except Family creation. Requires the dataset
// file to already exist; never silently opens/creates an empty, unmigrated
// database (contract §10: "must fail safely rather than silently opening
// another Family").
export function getFamilyDb(familyId: string): Db {
  const cached = cache.get(familyId);
  if (cached) return cached;

  const filePath = familyDbPath(familyId);
  if (!existsSync(filePath)) throw new FamilyDatasetNotFoundError(familyId);

  const db = openConnection(filePath);
  cache.set(familyId, db);
  return db;
}

// Creation path — called once, at Family creation (contract §9): ensures
// the isolated dataset exists and is migrated, then opens/caches it.
export function provisionFamilyDb(familyId: string): Db {
  if (!existsSync(FAMILIES_DIR)) mkdirSync(FAMILIES_DIR, { recursive: true });

  const db = openConnection(familyDbPath(familyId));
  cache.set(familyId, db);
  return db;
}

// Deletion path (Family deletion, product-polish pass) — closes the
// underlying better-sqlite3 connection (via Drizzle's own `$client`
// accessor) if it's cached, evicts the cache entry, then removes the
// dataset file and its WAL/SHM sidecars (journal_mode = WAL is set on
// every connection, so both can exist alongside the main file). Hard
// delete, consistent with rule #9 — no soft-delete, no "hide the file"
// half-measure (contract §15's condition for allowing deletion at all).
export function evictFamilyDb(familyId: string): void {
  const cached = cache.get(familyId);
  if (cached) {
    cached.$client.close();
    cache.delete(familyId);
  }

  const filePath = familyDbPath(familyId);
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${filePath}${suffix}`, { force: true });
  }
}
