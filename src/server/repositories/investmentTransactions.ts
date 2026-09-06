import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { investmentTransactions } from "../persistence/schema";

export type InvestmentTransactionRow = typeof investmentTransactions.$inferSelect;

export function insertInvestmentTransaction(db: DbOrTx, row: InvestmentTransactionRow): void {
  db.insert(investmentTransactions).values(row).run();
}

export function findInvestmentTransactionById(
  db: DbOrTx,
  id: string,
  profileId: string,
): InvestmentTransactionRow | undefined {
  return db
    .select()
    .from(investmentTransactions)
    .where(and(eq(investmentTransactions.id, id), eq(investmentTransactions.profileId, profileId)))
    .get();
}

export function findInvestmentTransactionsByProfile(
  db: DbOrTx,
  profileId: string,
): InvestmentTransactionRow[] {
  return db
    .select()
    .from(investmentTransactions)
    .where(eq(investmentTransactions.profileId, profileId))
    .all();
}

// Every recorded event for one Instrument, within one Profile — the input
// to `netUnitsFromTransactions` (core/portfolio) for that Instrument's
// current computed position.
export function findInvestmentTransactionsByInstrument(
  db: DbOrTx,
  profileId: string,
  instrumentId: string,
): InvestmentTransactionRow[] {
  return db
    .select()
    .from(investmentTransactions)
    .where(
      and(
        eq(investmentTransactions.profileId, profileId),
        eq(investmentTransactions.instrumentId, instrumentId),
      ),
    )
    .all();
}

// Idempotent re-import (schema.ts's own comment on `dedup_key`) — a
// content hash already seen for this Profile means the row was already
// persisted by an earlier import run.
export function findInvestmentTransactionByDedupKey(
  db: DbOrTx,
  profileId: string,
  dedupKey: string,
): InvestmentTransactionRow | undefined {
  return db
    .select()
    .from(investmentTransactions)
    .where(
      and(
        eq(investmentTransactions.profileId, profileId),
        eq(investmentTransactions.dedupKey, dedupKey),
      ),
    )
    .get();
}

export function deleteAllInvestmentTransactions(db: DbOrTx, profileId: string): void {
  db.delete(investmentTransactions).where(eq(investmentTransactions.profileId, profileId)).run();
}
