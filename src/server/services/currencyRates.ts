import { decimalRateToMinorRational, makeRational, minorRationalToDecimalRate, type Rational } from "@/core";
import type { DbOrTx } from "../persistence/client";
import { findCurrencyById } from "../repositories/currencies";
import { findProfileById } from "../repositories/profiles";
import {
  deleteCurrencyRateRow,
  findCurrencyRateById,
  findCurrencyRateOnDate,
  findCurrencyRatesByCurrency,
  findLatestCurrencyRateOnOrBefore,
  findOtherCurrencyRateOnDate,
  insertCurrencyRateRow,
  updateCurrencyRateRow,
  type CurrencyRateRow,
} from "../repositories/currencyRates";
import { DuplicateCurrencyRateError, NoBaseCurrencyError, NotFoundError } from "./errors";

// Every write re-verifies the Currency belongs to the caller's Profile
// (rule #6) — `currency_rates` itself has no `profileId` column (FX Rate UX
// delta), so this is the enforcement point ownership would otherwise come
// from a DB-level filter.
function resolveOwnedCurrency(db: DbOrTx, currencyId: string, profileId: string) {
  const currency = findCurrencyById(db, currencyId, profileId);
  if (!currency) {
    throw new NotFoundError(`Currency ${currencyId} not found for profile ${profileId}`);
  }
  return currency;
}

// Exported for the Transaction Form FX UX delta — the create/edit
// Transaction flow needs the Profile's Base Currency's id/code/symbol/scale
// up front (once per form), same lookup this file's own writes already do
// for authorization.
export function resolveBaseCurrencyForProfile(db: DbOrTx, profileId: string) {
  const profile = findProfileById(db, profileId);
  const baseCurrency = profile?.primaryCurrencyId ? findCurrencyById(db, profile.primaryCurrencyId, profileId) : undefined;
  if (!baseCurrency) {
    throw new NoBaseCurrencyError();
  }
  return baseCurrency;
}

export interface CurrencyRateDisplay {
  id: string;
  date: string;
  // The standard one-unit quotation ("1 JPY = ₹0.5800") — a *major*-unit
  // decimal for display/editing. Never `rate_num`/`rate_denom` directly
  // (the delta's own "do not expose rate_num/rate_denom to the user").
  rateDecimal: number;
}

export function listCurrencyRatesForCurrency(db: DbOrTx, currencyId: string, profileId: string): CurrencyRateDisplay[] {
  const currency = resolveOwnedCurrency(db, currencyId, profileId);
  const baseCurrency = resolveBaseCurrencyForProfile(db, profileId);
  return findCurrencyRatesByCurrency(db, currencyId).map((row) => ({
    id: row.id,
    date: row.date,
    rateDecimal: minorRationalToDecimalRate({ num: row.rateNum, denom: row.rateDenom }, currency.minorUnitScale, baseCurrency.minorUnitScale),
  }));
}

export interface UpsertCurrencyRateInput {
  // Present -> edit that existing row. Absent -> create a new one.
  id?: string;
  profileId: string;
  currencyId: string;
  date: string;
  rateDecimal: number;
}

export function upsertCurrencyRate(db: DbOrTx, input: UpsertCurrencyRateInput): CurrencyRateRow {
  const currency = resolveOwnedCurrency(db, input.currencyId, input.profileId);
  const baseCurrency = resolveBaseCurrencyForProfile(db, input.profileId);
  const rational = decimalRateToMinorRational(input.rateDecimal, currency.minorUnitScale, baseCurrency.minorUnitScale);
  const now = new Date().toISOString();

  if (input.id) {
    const existing = findCurrencyRateById(db, input.id);
    if (!existing || existing.currencyId !== input.currencyId) {
      throw new NotFoundError(`CurrencyRate ${input.id} not found for currency ${input.currencyId}`);
    }
    if (findOtherCurrencyRateOnDate(db, input.currencyId, input.date, input.id)) {
      throw new DuplicateCurrencyRateError(input.date);
    }
    const updated: CurrencyRateRow = { ...existing, date: input.date, rateNum: rational.num, rateDenom: rational.denom, updatedAt: now };
    updateCurrencyRateRow(db, input.id, { date: updated.date, rateNum: updated.rateNum, rateDenom: updated.rateDenom, updatedAt: now });
    return updated;
  }

  if (findCurrencyRateOnDate(db, input.currencyId, input.date)) {
    throw new DuplicateCurrencyRateError(input.date);
  }
  const row: CurrencyRateRow = {
    id: crypto.randomUUID(),
    currencyId: input.currencyId,
    date: input.date,
    rateNum: rational.num,
    rateDenom: rational.denom,
    createdAt: now,
    updatedAt: now,
  };
  insertCurrencyRateRow(db, row);
  return row;
}

export interface DeleteCurrencyRateInput {
  profileId: string;
  currencyId: string;
  rateId: string;
}

export function deleteCurrencyRate(db: DbOrTx, input: DeleteCurrencyRateInput): void {
  resolveOwnedCurrency(db, input.currencyId, input.profileId);
  const existing = findCurrencyRateById(db, input.rateId);
  if (!existing || existing.currencyId !== input.currencyId) {
    throw new NotFoundError(`CurrencyRate ${input.rateId} not found for currency ${input.currencyId}`);
  }
  deleteCurrencyRateRow(db, input.rateId);
}

// The delta's own lookup rule: exact-date rate; else the latest rate on or
// before that date (never a future one — only ever queried via `<= date`);
// else 1/1 parity. A *default* only — never itself the historical source
// of truth for an already-committed Transaction (that's the Posting's own
// stored `price_num`/`price_denom`, copied from this at creation time and
// never retroactively changed by a later edit/delete here). Wired into
// transaction creation by the Transaction Form FX UX delta —
// `services/transactions.ts`'s `derivePostings` falls back to this for any
// posting whose Account currency differs from the Base Currency and whose
// rate wasn't explicitly supplied by the caller.
export function resolveCurrencyRate(db: DbOrTx, currencyId: string, baseCurrencyId: string, date: string): Rational {
  if (currencyId === baseCurrencyId) {
    return makeRational(1, 1);
  }
  const onDate = findCurrencyRateOnDate(db, currencyId, date);
  if (onDate) {
    return makeRational(onDate.rateNum, onDate.rateDenom);
  }
  const latest = findLatestCurrencyRateOnOrBefore(db, currencyId, date);
  if (latest) {
    return makeRational(latest.rateNum, latest.rateDenom);
  }
  return makeRational(1, 1);
}

// The Transaction Form's own default-rate fetch (FX UX delta) — same
// lookup as `resolveCurrencyRate`, converted to the major-unit decimal the
// UI actually shows/edits ("1 JPY = [ 0.5800 ] INR"), never rate_num/
// rate_denom. `currencyId` here is the Account's own Currency (the one
// being priced), verified to belong to the caller's Profile before the
// lookup runs, same as every other write/read in this file.
export function getDefaultCurrencyRateDecimal(db: DbOrTx, profileId: string, currencyId: string, date: string): number {
  const currency = resolveOwnedCurrency(db, currencyId, profileId);
  const baseCurrency = resolveBaseCurrencyForProfile(db, profileId);
  const rational = resolveCurrencyRate(db, currencyId, baseCurrency.id, date);
  return minorRationalToDecimalRate(rational, currency.minorUnitScale, baseCurrency.minorUnitScale);
}
