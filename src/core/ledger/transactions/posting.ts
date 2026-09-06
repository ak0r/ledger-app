import { isNonNegativeInteger, type Money } from "../../shared/money";
import type { Quantity } from "../../shared/quantity";

export interface PostingInput {
  accountId: string;
  debit: Money;
  credit: Money;
  // Revised Investment Model delta (2026-09-03) — posting-level, not
  // instrument-only. `quantity` is the natural count this posting
  // represents (a cash/FX leg's own decimal currency amount at the fixed
  // Quantity scale; an Instrument leg's units acquired/disposed). `price`
  // is the value of 1 unit of `quantity`, expressed in the transaction's
  // reconciliation currency (domain/transaction.ts) — always exactly 1 for
  // a posting already in that currency, a real conversion rate only for
  // the one leg (if any) that isn't. Both always positive; direction comes
  // from debit/credit, same as today.
  quantity: Quantity;
  price: number;
}

export type PostingViolationCode =
  | "NEGATIVE_AMOUNT"
  | "NOT_EXACTLY_ONE_SIDE"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE";

export interface PostingViolation {
  code: PostingViolationCode;
  accountId: string;
}

// Posting invariant (docs/03-accounting-principles.md):
// debit >= 0, credit >= 0, exactly one of them strictly positive.
// quantity/price are magnitudes (direction already comes from debit/
// credit) — always strictly positive, same reasoning as debit/credit's
// own "non-negative, exactly one side positive" rule.
export function validatePosting(posting: PostingInput): PostingViolation[] {
  const violations: PostingViolation[] = [];

  if (!isNonNegativeInteger(posting.debit) || !isNonNegativeInteger(posting.credit)) {
    violations.push({ code: "NEGATIVE_AMOUNT", accountId: posting.accountId });
  }

  const positiveSides = (posting.debit > 0 ? 1 : 0) + (posting.credit > 0 ? 1 : 0);
  if (positiveSides !== 1) {
    violations.push({ code: "NOT_EXACTLY_ONE_SIDE", accountId: posting.accountId });
  }

  if (!Number.isInteger(posting.quantity) || posting.quantity <= 0) {
    violations.push({ code: "INVALID_QUANTITY", accountId: posting.accountId });
  }

  if (!Number.isFinite(posting.price) || posting.price <= 0) {
    violations.push({ code: "INVALID_PRICE", accountId: posting.accountId });
  }

  return violations;
}
