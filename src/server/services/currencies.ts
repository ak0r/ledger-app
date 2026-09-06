import { findCurrencyDefinition, isSupportedCurrencyCode } from "@/core";
import type { Db } from "../persistence/client";
import {
  findCurrenciesByProfile,
  insertCurrency,
  type CurrencyRow,
} from "../repositories/currencies";
import { findProfileById, setProfilePrimaryCurrencyId } from "../repositories/profiles";
import { CurrencyAlreadyAddedError, UnsupportedCurrencyError } from "./errors";

// Currency creation is a separate step from Profile creation (resolved
// 2026-08-15, see HANDOFF.md open decisions #1) — the screens/use-cases
// stay independent so multi-currency Profiles don't need re-splitting.
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

  // Checked *before* inserting — "is this Profile's first Currency" must
  // mean it had zero Currencies going in, not just "primaryCurrencyId
  // happens to be null right now". A Profile whose Currency was seeded by
  // a path that bypasses this function entirely (demo dataset's direct
  // insertCurrency call) can have a Currency yet no Primary set; the next
  // real Add Currency through here must not mistake that gap for "this is
  // the first Currency" and steal Primary out from under the existing one.
  const hadNoCurrenciesYet = findCurrenciesByProfile(db, input.profileId).length === 0;

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

  // A Profile's first Currency becomes its Primary Currency automatically —
  // otherwise "default for newly created Accounts" (Currency Catalogue
  // delta) stays inert until someone visits Manage Profiles and sets it by
  // hand. Only fires once: a Profile that already has a Primary Currency,
  // or already had another Currency before this one, keeps things as they
  // are — a later Add Currency must never silently reassign Primary.
  const profile = findProfileById(db, input.profileId);
  if (profile && !profile.primaryCurrencyId && hadNoCurrenciesYet) {
    setProfilePrimaryCurrencyId(db, input.profileId, currency.id, now);
  }

  return currency;
}

export function listCurrencies(db: Db, profileId: string): CurrencyRow[] {
  return findCurrenciesByProfile(db, profileId);
}

export interface AddCurrencyFromCatalogInput {
  profileId: string;
  code: string;
}

// "Add Currency" (Currencies section, 2026-09-03 Settings/Backup/Data
// Management delta §6.2) — the user only picks a code from the Currency
// Catalogue; name/symbol/minorUnitScale are always derived server-side,
// never trusted from the client (delta: "Currencies are selected from
// recognised currency definitions", not free-typed). A thin wrapper around
// createCurrency, which stays as-is (free-form name/symbol/scale) for its
// other callers — import/demo/test fixtures that construct a Currency row
// directly, not through this UI-facing picker.
export function addCurrencyFromCatalog(db: Db, input: AddCurrencyFromCatalogInput): CurrencyRow {
  const definition = findCurrencyDefinition(input.code);
  if (!definition) throw new UnsupportedCurrencyError(input.code);

  const existing = findCurrenciesByProfile(db, input.profileId);
  if (existing.some((currency) => currency.code === input.code)) {
    throw new CurrencyAlreadyAddedError(input.code);
  }

  return createCurrency(db, { profileId: input.profileId, ...definition });
}
