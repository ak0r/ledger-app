import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { holdings } from "../persistence/schema";

export type HoldingRow = typeof holdings.$inferSelect;

export function insertHolding(db: DbOrTx, row: HoldingRow): void {
  db.insert(holdings).values(row).run();
}

export function findHoldingsByProfile(db: DbOrTx, profileId: string): HoldingRow[] {
  return db.select().from(holdings).where(eq(holdings.profileId, profileId)).all();
}

export function findHoldingsByInstrument(
  db: DbOrTx,
  profileId: string,
  instrumentId: string,
): HoldingRow[] {
  return db
    .select()
    .from(holdings)
    .where(and(eq(holdings.profileId, profileId), eq(holdings.instrumentId, instrumentId)))
    .all();
}

export function deleteAllHoldings(db: DbOrTx, profileId: string): void {
  db.delete(holdings).where(eq(holdings.profileId, profileId)).run();
}
