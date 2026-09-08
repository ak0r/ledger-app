// Account Types, Money Representation, Rational Pricing, FX & Liability
// Details delta — replaces the old `{ debit, credit, quantity, price }`
// shape (Revised Investment Model delta, 2026-09-03) with an exact-rational
// one. `quantity` (a fixed-point workaround, QUANTITY_SCALE) is retired
// entirely: exact rational pricing makes it redundant.
export interface PostingInput {
  accountId: string;
  // Signed integer minor units in the Posting Account's own currency.
  // `units = debit - credit` under the old model — an Asset receiving money
  // is positive (e.g. a JPY account receiving ¥70,000 is `units = +70000`,
  // matching the delta's own worked examples), paying money out is negative.
  units: number;
  // Exact rational valuation ratio converting `units` into the
  // reconciliation currency's minor units — both always positive integers.
  // `priceNum = priceDenom = 1` for a posting already in that currency.
  priceNum: number;
  priceDenom: number;
  // Signed integer minor units in the reconciliation (Profile Base)
  // currency. For the one posting whose currency matches the reconciliation
  // currency exactly, this always equals `units`. For every other posting,
  // computed via half-even rounding of `units * priceNum / priceDenom` —
  // except the transaction's one primary/payment leg, whose `baseAmount` is
  // instead the exact negative sum of every other leg's `baseAmount`
  // (`core/ledger/transactions/baseAmount.ts`), so the residual of any
  // independent leg's rounding always lands there, never rejected as a ±1
  // imbalance.
  baseAmount: number;
}

export type PostingViolationCode = "INVALID_UNITS" | "PRICE_NOT_POSITIVE" | "INVALID_BASE_AMOUNT";

export interface PostingViolation {
  code: PostingViolationCode;
  accountId: string;
}

// Posting invariant: `units` is a nonzero integer (a posting must actually
// move money — the old "not both zero, not both positive" debit/credit rule
// collapses to "signed and nonzero" once direction lives in one field).
// `priceNum`/`priceDenom` are positive integers. `baseAmount` is a nonzero
// integer — its sign/magnitude relationship to `units` depends on currency
// context (handled in transaction.ts, which has the Account map).
export function validatePosting(posting: PostingInput): PostingViolation[] {
  const violations: PostingViolation[] = [];

  if (!Number.isInteger(posting.units) || posting.units === 0) {
    violations.push({ code: "INVALID_UNITS", accountId: posting.accountId });
  }

  if (!Number.isInteger(posting.priceNum) || !Number.isInteger(posting.priceDenom) || posting.priceNum <= 0 || posting.priceDenom <= 0) {
    violations.push({ code: "PRICE_NOT_POSITIVE", accountId: posting.accountId });
  }

  if (!Number.isInteger(posting.baseAmount) || posting.baseAmount === 0) {
    violations.push({ code: "INVALID_BASE_AMOUNT", accountId: posting.accountId });
  }

  return violations;
}
