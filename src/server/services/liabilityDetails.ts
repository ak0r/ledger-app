import { fromMinorUnits, toMinorUnits } from "@/core";
import type { Db } from "../persistence/client";
import { findAccountById } from "../repositories/accounts";
import { findCurrencyById } from "../repositories/currencies";
import {
  findCreditCardDetailsByAccountId,
  findLoanDetailsByAccountId,
  upsertCreditCardDetailsRow,
  upsertLoanDetailsRow,
  type CreditCardDetailsRow,
  type LoanDetailsRow,
} from "../repositories/liabilityDetails";
import { NotFoundError } from "./errors";

function accountCurrencyScale(db: Db, accountId: string, profileId: string): number {
  const account = findAccountById(db, accountId, profileId);
  if (!account) {
    throw new NotFoundError(`Account ${accountId} not found for profile ${profileId}`);
  }
  const currency = findCurrencyById(db, account.currencyId, profileId);
  if (!currency) {
    throw new NotFoundError(`Currency ${account.currencyId} not found for profile ${profileId}`);
  }
  return currency.minorUnitScale;
}

// Liability supporting information (Account Types, Money Representation,
// Rational Pricing, FX & Liability Details delta §7) — contractual/input
// facts only. Money fields take/return major-unit decimals at this layer
// (the account's own Currency scale), same boundary-conversion convention
// as every other service (core/shared/money.ts's `toMinorUnits`/
// `fromMinorUnits`) — minor units are an internal storage detail, never a
// user-facing one.
export interface CreditCardDetails {
  accountId: string;
  creditLimit: number | null;
  statementEndDay: number | null;
  dueDay: number | null;
  network: string | null;
  last4: string | null;
  expirationDate: string | null;
}

function toCreditCardDetails(row: CreditCardDetailsRow, scale: number): CreditCardDetails {
  return {
    accountId: row.accountId,
    creditLimit: row.creditLimitMinor !== null ? fromMinorUnits(row.creditLimitMinor, scale) : null,
    statementEndDay: row.statementEndDay,
    dueDay: row.dueDay,
    network: row.network,
    last4: row.last4,
    expirationDate: row.expirationDate,
  };
}

export function getCreditCardDetails(db: Db, accountId: string, profileId: string): CreditCardDetails | undefined {
  const scale = accountCurrencyScale(db, accountId, profileId);
  const row = findCreditCardDetailsByAccountId(db, accountId);
  return row ? toCreditCardDetails(row, scale) : undefined;
}

export interface UpsertCreditCardDetailsInput {
  accountId: string;
  profileId: string;
  creditLimit?: number | null;
  statementEndDay?: number | null;
  dueDay?: number | null;
  network?: string | null;
  last4?: string | null;
  expirationDate?: string | null;
}

export function upsertCreditCardDetails(db: Db, input: UpsertCreditCardDetailsInput): CreditCardDetails {
  const scale = accountCurrencyScale(db, input.accountId, input.profileId);
  const existing = findCreditCardDetailsByAccountId(db, input.accountId);
  const now = new Date().toISOString();
  const row: CreditCardDetailsRow = {
    id: existing?.id ?? crypto.randomUUID(),
    accountId: input.accountId,
    creditLimitMinor: input.creditLimit != null ? toMinorUnits(input.creditLimit, scale) : null,
    statementEndDay: input.statementEndDay ?? null,
    dueDay: input.dueDay ?? null,
    network: input.network ?? null,
    last4: input.last4 ?? null,
    expirationDate: input.expirationDate ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  upsertCreditCardDetailsRow(db, row);
  return toCreditCardDetails(row, scale);
}

export interface LoanDetails {
  accountId: string;
  originalAmount: number | null;
  disbursedAmount: number | null;
  interestRatePercent: number | null;
  tenureMonths: number | null;
  emiAmount: number | null;
  emiDay: number | null;
  startDate: string | null;
  maturityDate: string | null;
}

function toLoanDetails(row: LoanDetailsRow, scale: number): LoanDetails {
  return {
    accountId: row.accountId,
    originalAmount: row.originalAmountMinor !== null ? fromMinorUnits(row.originalAmountMinor, scale) : null,
    disbursedAmount: row.disbursedAmountMinor !== null ? fromMinorUnits(row.disbursedAmountMinor, scale) : null,
    interestRatePercent: row.interestRateBps !== null ? row.interestRateBps / 100 : null,
    tenureMonths: row.tenureMonths,
    emiAmount: row.emiAmountMinor !== null ? fromMinorUnits(row.emiAmountMinor, scale) : null,
    emiDay: row.emiDay,
    startDate: row.startDate,
    maturityDate: row.maturityDate,
  };
}

export function getLoanDetails(db: Db, accountId: string, profileId: string): LoanDetails | undefined {
  const scale = accountCurrencyScale(db, accountId, profileId);
  const row = findLoanDetailsByAccountId(db, accountId);
  return row ? toLoanDetails(row, scale) : undefined;
}

export interface UpsertLoanDetailsInput {
  accountId: string;
  profileId: string;
  originalAmount?: number | null;
  disbursedAmount?: number | null;
  interestRatePercent?: number | null;
  tenureMonths?: number | null;
  emiAmount?: number | null;
  emiDay?: number | null;
  startDate?: string | null;
  maturityDate?: string | null;
}

export function upsertLoanDetails(db: Db, input: UpsertLoanDetailsInput): LoanDetails {
  const scale = accountCurrencyScale(db, input.accountId, input.profileId);
  const existing = findLoanDetailsByAccountId(db, input.accountId);
  const now = new Date().toISOString();
  const row: LoanDetailsRow = {
    id: existing?.id ?? crypto.randomUUID(),
    accountId: input.accountId,
    originalAmountMinor: input.originalAmount != null ? toMinorUnits(input.originalAmount, scale) : null,
    disbursedAmountMinor: input.disbursedAmount != null ? toMinorUnits(input.disbursedAmount, scale) : null,
    interestRateBps: input.interestRatePercent != null ? Math.round(input.interestRatePercent * 100) : null,
    tenureMonths: input.tenureMonths ?? null,
    emiAmountMinor: input.emiAmount != null ? toMinorUnits(input.emiAmount, scale) : null,
    emiDay: input.emiDay ?? null,
    startDate: input.startDate ?? null,
    maturityDate: input.maturityDate ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  upsertLoanDetailsRow(db, row);
  return toLoanDetails(row, scale);
}
