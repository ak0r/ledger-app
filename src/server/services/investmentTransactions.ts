import {
  validateInvestmentTransaction,
  type InvestmentTransactionSource,
  type InvestmentTransactionType,
} from "@/core";
import type { Db } from "../persistence/client";
import { findCurrencyById } from "../repositories/currencies";
import {
  findInvestmentTransactionByDedupKey,
  findInvestmentTransactionsByInstrument,
  findInvestmentTransactionsByProfile,
  insertInvestmentTransaction,
  type InvestmentTransactionRow,
} from "../repositories/investmentTransactions";
import { InvestmentTransactionValidationError, NotFoundError } from "./errors";

export interface CreateInvestmentTransactionInput {
  profileId: string;
  instrumentId: string;
  folioId?: string;
  date: string;
  type: InvestmentTransactionType;
  units: number;
  price: number;
  amount: number;
  currencyId: string;
  source: InvestmentTransactionSource;
  sourceRef?: string;
  narration?: string;
  dedupKey?: string;
}

// Validates against the core/portfolio domain layer before touching the DB
// (rule #17) — same posture as createTransaction in services/
// transactions.ts, just for a single-sided Portfolio event instead of a
// double-entry one. A `dedupKey` that already exists for this Profile is
// treated as "already imported, do nothing" rather than an error — the
// caller (a CAS/CSV import) can re-run safely; a manual entry never
// supplies one, so this branch never triggers for it.
export function createInvestmentTransaction(
  db: Db,
  input: CreateInvestmentTransactionInput,
): InvestmentTransactionRow {
  if (input.dedupKey) {
    const existing = findInvestmentTransactionByDedupKey(db, input.profileId, input.dedupKey);
    if (existing) return existing;
  }

  const currency = findCurrencyById(db, input.currencyId, input.profileId);
  if (!currency) {
    throw new NotFoundError(`Currency ${input.currencyId} not found for profile ${input.profileId}`);
  }

  const violations = validateInvestmentTransaction(
    { type: input.type, units: input.units, price: input.price, amount: input.amount },
    currency.minorUnitScale,
  );
  if (violations.length > 0) {
    throw new InvestmentTransactionValidationError(violations);
  }

  const now = new Date().toISOString();
  const transaction: InvestmentTransactionRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    instrumentId: input.instrumentId,
    folioId: input.folioId ?? null,
    date: input.date,
    type: input.type,
    units: input.units,
    price: input.price,
    amount: input.amount,
    currencyId: input.currencyId,
    source: input.source,
    sourceRef: input.sourceRef ?? null,
    narration: input.narration ?? null,
    dedupKey: input.dedupKey ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertInvestmentTransaction(db, transaction);
  return transaction;
}

export function listInvestmentTransactions(db: Db, profileId: string): InvestmentTransactionRow[] {
  return findInvestmentTransactionsByProfile(db, profileId);
}

export function listInvestmentTransactionsForInstrument(
  db: Db,
  profileId: string,
  instrumentId: string,
): InvestmentTransactionRow[] {
  return findInvestmentTransactionsByInstrument(db, profileId, instrumentId);
}
