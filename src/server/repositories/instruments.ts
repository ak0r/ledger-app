import { inArray, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { instruments } from "../db/schema";

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
