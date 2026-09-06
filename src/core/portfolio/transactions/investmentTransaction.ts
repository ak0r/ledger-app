import { fromQuantityMinorUnits, type Quantity } from "../../shared/quantity";

// Portfolio Adoption Plan (2026-09-05) §2 — the basic InvestmentTransaction
// shape, deliberately smaller than Folioman's own Transaction: no
// fx_rate_to_inr/fees/stamp_duty/brokerage/cost_total/cost_basis_complete
// yet ("these require separate Ledger-App decisions" — plan's own words).
// Sign convention mirrors Folioman's: units/price/amount are always
// non-negative, direction is carried by `type` alone, never by sign.
export const INVESTMENT_TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "BONUS",
  "SPLIT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
] as const;
export type InvestmentTransactionType = (typeof INVESTMENT_TRANSACTION_TYPES)[number];

export const INVESTMENT_TRANSACTION_SOURCES = ["MANUAL", "CSV_IMPORT", "CAS_PDF"] as const;
export type InvestmentTransactionSource = (typeof INVESTMENT_TRANSACTION_SOURCES)[number];

// Which transaction types change the held unit count — DIVIDEND is a cash
// event with no unit impact; BONUS/SPLIT are corporate-action-shaped but
// the plan explicitly defers real corporate-action replay to V2, so V1
// treats a BONUS/SPLIT row (if entered at all) as a plain unit change like
// BUY/SELL, not as a replayed event over immutable trades.
const UNIT_INCREASING_TYPES: ReadonlySet<InvestmentTransactionType> = new Set([
  "BUY",
  "BONUS",
  "TRANSFER_IN",
]);
const UNIT_DECREASING_TYPES: ReadonlySet<InvestmentTransactionType> = new Set([
  "SELL",
  "TRANSFER_OUT",
]);

export interface InvestmentTransactionInput {
  type: InvestmentTransactionType;
  units: Quantity;
  price: number;
  amount: number;
}

export type InvestmentTransactionViolationCode =
  | "NON_POSITIVE_UNITS"
  | "NON_POSITIVE_PRICE"
  | "AMOUNT_MISMATCH";

export interface InvestmentTransactionViolation {
  code: InvestmentTransactionViolationCode;
}

// units x price must equal amount, at the destination currency's own
// scale — the same reconciliation shape Ledger's own posting validation
// uses for an Instrument-backed leg (core/ledger/transactions/
// transaction.ts, before the Ledger/Portfolio delink removed it from
// there) — except here it's the *only* invariant, since there is no
// debit/credit pair to balance against; an InvestmentTransaction is a
// single-sided event, not a double-entry one.
//
// DIVIDEND is a cash-only event, not a unit-and-price one — a CAS
// statement's DIVIDEND_PAYOUT row (services/casImport.ts's own mapping)
// has zero units and no meaningful per-unit price, only an amount
// received. Forcing it through the units x price == amount check would
// reject every real dividend payout, so it's exempted entirely rather
// than made to fit a shape that doesn't apply to it.
export function validateInvestmentTransaction(
  input: InvestmentTransactionInput,
  currencyScale: number,
): InvestmentTransactionViolation[] {
  if (input.type === "DIVIDEND") return [];

  const violations: InvestmentTransactionViolation[] = [];

  if (input.units <= 0) violations.push({ code: "NON_POSITIVE_UNITS" });
  if (input.price <= 0) violations.push({ code: "NON_POSITIVE_PRICE" });

  const expectedAmount = Math.round(
    fromQuantityMinorUnits(input.units) * input.price * 10 ** currencyScale,
  );
  if (input.amount !== expectedAmount) {
    violations.push({ code: "AMOUNT_MISMATCH" });
  }

  return violations;
}

// Current position, netted fresh from transactions — deliberately never
// persisted (same "derived on read" posture as Ledger's own
// accountBalance summing postings every time, core/ledger/accounts/
// balance.ts). The persisted `holdings` table is for *observed* snapshots
// from an import/statement, a different fact from this computed position
// — mirrors Folioman's own HoldingSource.LEDGER ("derived in-memory, never
// persisted") vs. its ECAS/CAS_PDF/MANUAL sources (real observations).
export function netUnitsFromTransactions(
  transactions: readonly { type: InvestmentTransactionType; units: Quantity }[],
): Quantity {
  return transactions.reduce((total, txn) => {
    if (UNIT_INCREASING_TYPES.has(txn.type)) return total + txn.units;
    if (UNIT_DECREASING_TYPES.has(txn.type)) return total - txn.units;
    return total;
  }, 0);
}
