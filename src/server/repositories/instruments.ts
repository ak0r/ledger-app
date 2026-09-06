import { and, eq, inArray, like, or } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { instruments, type CatalogueSource, type InstrumentBackedType } from "../persistence/schema";
import type { NormalizedCatalogueInstrument } from "../catalogue/types";

export type InstrumentRow = typeof instruments.$inferSelect;

// NOT Profile-scoped (Instrument Model delta §2/§18) — see schema.ts's
// doc comment on the `instruments` table. Every function here reads/writes
// the shared catalogue, never filtered by Profile.

export function insertInstrument(db: DbOrTx, row: InstrumentRow): void {
  db.insert(instruments).values(row).run();
}

export function findInstrumentById(db: DbOrTx, id: string): InstrumentRow | undefined {
  return db.select().from(instruments).where(eq(instruments.id, id)).get();
}

// Bulk lookup for the Account-list Instrument join (getAccountBalances) —
// same shape as findPostingTotalsByProfile's Map-return pattern.
export function findInstrumentsByIds(db: DbOrTx, ids: readonly string[]): Map<string, InstrumentRow> {
  if (ids.length === 0) return new Map();
  const rows = db.select().from(instruments).where(inArray(instruments.id, ids)).all();
  return new Map(rows.map((row) => [row.id, row]));
}

export function findAllInstruments(db: DbOrTx): InstrumentRow[] {
  return db.select().from(instruments).all();
}

// CAS import's own identity resolution (services/casImport.ts) — a CAS
// statement identifies a scheme by ISIN, never by name (schemes get
// renamed by AMCs; ISIN doesn't change).
export function findInstrumentByIsin(
  db: DbOrTx,
  type: InstrumentBackedType,
  isin: string,
): InstrumentRow | undefined {
  return db
    .select()
    .from(instruments)
    .where(and(eq(instruments.type, type), eq(instruments.isin, isin)))
    .get();
}

// Fallback identity when a scheme has no ISIN (a stale/matured/segregated
// scheme still often carries an AMFI code) — also the AMFI bulk NAV feed's
// own primary key (services/priceFeeds/amfiNav.ts), so a scheme resolved
// this way can still be priced later.
export function findInstrumentByAmfiCode(
  db: DbOrTx,
  type: InstrumentBackedType,
  amfiCode: string,
): InstrumentRow | undefined {
  return db
    .select()
    .from(instruments)
    .where(and(eq(instruments.type, type), eq(instruments.amfiCode, amfiCode)))
    .get();
}

// Account form's Instrument picker (Instrument Catalogue delta,
// 2026-09-04 — replaces the Revised Investment Model delta's Phase 4
// full-fetch-then-client-filter, which doesn't scale once the catalogue
// holds a real ~5600-row stock feed). A SQL LIKE search against the local
// catalogue (delta §5, never IndianAPI live) over name plus every
// identifier a record might carry, capped at `limit` results — this is a
// picker typeahead, not a paginated browse.
export function searchInstruments(
  db: DbOrTx,
  type: InstrumentBackedType,
  query: string,
  limit: number,
): InstrumentRow[] {
  const pattern = `%${query}%`;
  return db
    .select()
    .from(instruments)
    .where(
      and(
        eq(instruments.type, type),
        or(
          like(instruments.name, pattern),
          like(instruments.nseCode, pattern),
          like(instruments.bseCode, pattern),
          like(instruments.sourceId, pattern),
        ),
      ),
    )
    .limit(limit)
    .all();
}

// Instrument Catalogue delta (2026-09-04) — upserts a normalized source
// batch (src/server/catalogue/normalize.ts) into the shared catalogue.
// Matches identity on `(source, sourceId)` (delta §3: "prefer source
// identity over name matching") rather than a DB unique index — this
// codebase's existing posture for relationships SQLite can't cheaply
// constrain (see accounts.instrumentId's own comment). Strictly additive/
// updating, never deletes: a record present locally but missing from the
// latest source response is left untouched, which is exactly delta §4's
// "preserve existing local records not present in the new response"
// requirement — there's no separate "prune" step to accidentally get
// wrong. A user-created Instrument (source is null) is never touched here,
// since it can never match a `(source, sourceId)` lookup.
export function upsertCatalogueInstruments(
  db: DbOrTx,
  type: InstrumentBackedType,
  source: CatalogueSource,
  records: readonly NormalizedCatalogueInstrument[],
): number {
  const existing = db
    .select()
    .from(instruments)
    .where(and(eq(instruments.type, type), eq(instruments.source, source)))
    .all();
  const existingBySourceId = new Map(
    existing.filter((row) => row.sourceId !== null).map((row) => [row.sourceId as string, row]),
  );

  const now = new Date().toISOString();
  let count = 0;
  for (const record of records) {
    const match = existingBySourceId.get(record.sourceId);
    if (match) {
      db.update(instruments)
        .set({
          name: record.name,
          nseCode: record.nseCode,
          bseCode: record.bseCode,
          isin: record.isin,
          updatedAt: now,
        })
        .where(eq(instruments.id, match.id))
        .run();
    } else {
      db.insert(instruments)
        .values({
          id: crypto.randomUUID(),
          type,
          name: record.name,
          unitLabel: null,
          source,
          sourceId: record.sourceId,
          nseCode: record.nseCode,
          bseCode: record.bseCode,
          isin: record.isin,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    count += 1;
  }
  return count;
}
