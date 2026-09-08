import { and, desc, eq, lte, ne } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { currencyRates } from "../persistence/schema";

export type CurrencyRateRow = typeof currencyRates.$inferSelect;

export function insertCurrencyRateRow(db: DbOrTx, row: CurrencyRateRow): void {
  db.insert(currencyRates).values(row).run();
}

export function updateCurrencyRateRow(
  db: DbOrTx,
  id: string,
  fields: Pick<CurrencyRateRow, "date" | "rateNum" | "rateDenom" | "updatedAt">,
): void {
  db.update(currencyRates).set(fields).where(eq(currencyRates.id, id)).run();
}

export function deleteCurrencyRateRow(db: DbOrTx, id: string): void {
  db.delete(currencyRates).where(eq(currencyRates.id, id)).run();
}

export function findCurrencyRateById(db: DbOrTx, id: string): CurrencyRateRow | undefined {
  return db.select().from(currencyRates).where(eq(currencyRates.id, id)).get();
}

export function findCurrencyRateOnDate(db: DbOrTx, currencyId: string, date: string): CurrencyRateRow | undefined {
  return db
    .select()
    .from(currencyRates)
    .where(and(eq(currencyRates.currencyId, currencyId), eq(currencyRates.date, date)))
    .get();
}

// Same (currencyId, date) but a different row id — the collision check for
// an edit that changes a rate's date (Add has no `excludeId`, so this
// naturally degrades to "any row on that date" via `findCurrencyRateOnDate`
// above instead).
export function findOtherCurrencyRateOnDate(
  db: DbOrTx,
  currencyId: string,
  date: string,
  excludeId: string,
): CurrencyRateRow | undefined {
  return db
    .select()
    .from(currencyRates)
    .where(and(eq(currencyRates.currencyId, currencyId), eq(currencyRates.date, date), ne(currencyRates.id, excludeId)))
    .get();
}

// Latest rate on or before `date` — the lookup delta's own "if no rate
// exists on that date, use the latest available rate on or before" rule.
// `ORDER BY date DESC LIMIT 1` after the `<=` filter picks it directly, no
// app-side scan.
export function findLatestCurrencyRateOnOrBefore(
  db: DbOrTx,
  currencyId: string,
  date: string,
): CurrencyRateRow | undefined {
  return db
    .select()
    .from(currencyRates)
    .where(and(eq(currencyRates.currencyId, currencyId), lte(currencyRates.date, date)))
    .orderBy(desc(currencyRates.date))
    .limit(1)
    .get();
}

export function findCurrencyRatesByCurrency(db: DbOrTx, currencyId: string): CurrencyRateRow[] {
  return db
    .select()
    .from(currencyRates)
    .where(eq(currencyRates.currencyId, currencyId))
    .orderBy(desc(currencyRates.date))
    .all();
}
