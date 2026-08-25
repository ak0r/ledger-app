import { isSupportedCurrencyCode } from "@/domain";
import type { Db } from "../db/client";
import {
  findCurrenciesByProfile,
  insertCurrency,
  type CurrencyRow,
} from "../repositories/currencies";
import { UnsupportedCurrencyError } from "./errors";

// Currency creation is a separate step from Profile creation (resolved
// 2026-08-15, see HANDOFF.md open decisions #1) — even though MVP enforces
// INR-only (rule #7, ADR-020), the screens/use-cases stay independent so
// a future multi-currency Profile doesn't require re-splitting this flow.
export interface CreateCurrencyInput {
  profileId: string;
  code: string;
  name: string;
  symbol: string;
  minorUnitScale: number;
}

export function createCurrency(db: Db, input: CreateCurrencyInput): CurrencyRow {
  if (!isSupportedCurrencyCode(input.code)) {
    throw new UnsupportedCurrencyError(input.code);
  }

  const now = new Date().toISOString();
  const currency: CurrencyRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    code: input.code,
    name: input.name,
    symbol: input.symbol,
    minorUnitScale: input.minorUnitScale,
    createdAt: now,
    updatedAt: now,
  };
  insertCurrency(db, currency);
  return currency;
}

export function listCurrencies(db: Db, profileId: string): CurrencyRow[] {
  return findCurrenciesByProfile(db, profileId);
}
