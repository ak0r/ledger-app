import { isNonNegativeInteger, type Money } from "./money";

export interface PostingInput {
  accountId: string;
  debit: Money;
  credit: Money;
}

export type PostingViolationCode = "NEGATIVE_AMOUNT" | "NOT_EXACTLY_ONE_SIDE";

export interface PostingViolation {
  code: PostingViolationCode;
  accountId: string;
}

// Posting invariant (docs/03-accounting-principles.md):
// debit >= 0, credit >= 0, exactly one of them strictly positive.
export function validatePosting(posting: PostingInput): PostingViolation[] {
  const violations: PostingViolation[] = [];

  if (!isNonNegativeInteger(posting.debit) || !isNonNegativeInteger(posting.credit)) {
    violations.push({ code: "NEGATIVE_AMOUNT", accountId: posting.accountId });
  }

  const positiveSides = (posting.debit > 0 ? 1 : 0) + (posting.credit > 0 ? 1 : 0);
  if (positiveSides !== 1) {
    violations.push({ code: "NOT_EXACTLY_ONE_SIDE", accountId: posting.accountId });
  }

  return violations;
}
