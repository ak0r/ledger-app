import type { Db } from "../persistence/client";
import type { CurrencyRow } from "../repositories/currencies";
import type { CurrencyRateRow } from "../repositories/currencyRates";
import { addCurrencyFromCatalog, createCurrency } from "../services/currencies";
import { deleteCurrencyRate, getDefaultCurrencyRateDecimal, resolveBaseCurrencyForProfile, upsertCurrencyRate } from "../services/currencyRates";
import {
  addCurrencySchema,
  createCurrencySchema,
  deleteCurrencyRateSchema,
  getDefaultCurrencyRateSchema,
  upsertCurrencyRateSchema,
} from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createCurrencyCore(db: Db, input: unknown): ActionResult<CurrencyRow> {
  const parsed = createCurrencySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createCurrency(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function addCurrencyCore(db: Db, input: unknown): ActionResult<CurrencyRow> {
  const parsed = addCurrencySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(addCurrencyFromCatalog(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function upsertCurrencyRateCore(db: Db, input: unknown): ActionResult<CurrencyRateRow> {
  const parsed = upsertCurrencyRateSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(upsertCurrencyRate(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function deleteCurrencyRateCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = deleteCurrencyRateSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    deleteCurrencyRate(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}

export interface BaseCurrencyInfo {
  id: string;
  code: string;
  symbol: string;
  minorUnitScale: number;
}

// Transaction Form FX UX delta — the create/edit Transaction form fetches
// this once (no input beyond the active Profile) to know which Account
// Currency is the reconciliation target and how to label/scale a rate
// input for it.
export function getActiveProfileBaseCurrencyCore(db: Db, profileId: string): ActionResult<BaseCurrencyInfo> {
  try {
    const currency = resolveBaseCurrencyForProfile(db, profileId);
    return ok({ id: currency.id, code: currency.code, symbol: currency.symbol, minorUnitScale: currency.minorUnitScale });
  } catch (error) {
    return fromThrown(error);
  }
}

export function getDefaultCurrencyRateCore(db: Db, input: unknown): ActionResult<{ rateDecimal: number }> {
  const parsed = getDefaultCurrencyRateSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok({ rateDecimal: getDefaultCurrencyRateDecimal(db, parsed.data.profileId, parsed.data.currencyId, parsed.data.date) });
  } catch (error) {
    return fromThrown(error);
  }
}
