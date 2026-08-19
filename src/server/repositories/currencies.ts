import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/family-client";
import { currencies } from "../db/schema";

export type CurrencyRow = typeof currencies.$inferSelect;

export function insertCurrency(db: DbOrTx, row: CurrencyRow): void {
  db.insert(currencies).values(row).run();
}

// Unscoped — see deleteAllTransactions in repositories/transactions.ts for
// why this is safe without a memberId filter (Clean Up Content only).
export function deleteAllCurrencies(db: DbOrTx): void {
  db.delete(currencies).run();
}

// Member-scoped (rule #6): a currency lookup always requires the owning
// Member, so one Member can never read/reference another Member's currency.
export function findCurrencyById(
  db: DbOrTx,
  id: string,
  memberId: string,
): CurrencyRow | undefined {
  return db
    .select()
    .from(currencies)
    .where(and(eq(currencies.id, id), eq(currencies.memberId, memberId)))
    .get();
}

export function findCurrenciesByMember(db: DbOrTx, memberId: string): CurrencyRow[] {
  return db.select().from(currencies).where(eq(currencies.memberId, memberId)).all();
}
