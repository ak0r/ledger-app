import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { currencies } from "../persistence/schema";

export type CurrencyRow = typeof currencies.$inferSelect;

export function insertCurrency(db: DbOrTx, row: CurrencyRow): void {
  db.insert(currencies).values(row).run();
}

// Profile-scoped (rule #6) — see deleteAllTransactions in
// repositories/transactions.ts for why this must filter explicitly now
// that all Profiles share one database (Clean Up Content only).
export function deleteAllCurrencies(db: DbOrTx, profileId: string): void {
  db.delete(currencies).where(eq(currencies.profileId, profileId)).run();
}

// Profile-scoped (rule #6): a currency lookup always requires the owning
// Profile, so one Profile can never read/reference another Profile's
// currency.
export function findCurrencyById(
  db: DbOrTx,
  id: string,
  profileId: string,
): CurrencyRow | undefined {
  return db
    .select()
    .from(currencies)
    .where(and(eq(currencies.id, id), eq(currencies.profileId, profileId)))
    .get();
}

export function findCurrenciesByProfile(db: DbOrTx, profileId: string): CurrencyRow[] {
  return db.select().from(currencies).where(eq(currencies.profileId, profileId)).all();
}
