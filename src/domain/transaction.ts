import { isSupportedCurrencyCode } from "./currency";
import { sum } from "./money";
import { validatePosting, type PostingInput, type PostingViolationCode } from "./posting";

export interface AccountRef {
  id: string;
  profileId: string;
  currencyCode: string;
}

export interface TransactionInput {
  profileId: string;
  postings: readonly PostingInput[];
}

export type TransactionViolation =
  | { code: "TOO_FEW_POSTINGS" }
  | { code: "UNBALANCED"; totalDebit: number; totalCredit: number }
  | { code: "INVALID_POSTING"; accountId: string; reason: PostingViolationCode }
  | { code: "ACCOUNT_NOT_FOUND"; accountId: string }
  | { code: "OWNERSHIP_MISMATCH"; accountId: string }
  | { code: "UNSUPPORTED_CURRENCY"; accountId: string; currencyCode: string };

// Aggregate validation for a Transaction + its Postings. Pure — callers
// (Phase 4 use-cases) look up Accounts and pass them in; this never touches
// a database. A persisted Transaction must produce zero violations
// (docs/03-accounting-principles.md, AGENTS.md rules #3-#7).
export function validateTransaction(
  input: TransactionInput,
  accounts: ReadonlyMap<string, AccountRef>,
): TransactionViolation[] {
  const violations: TransactionViolation[] = [];

  if (input.postings.length < 2) {
    violations.push({ code: "TOO_FEW_POSTINGS" });
  }

  for (const posting of input.postings) {
    for (const postingViolation of validatePosting(posting)) {
      violations.push({
        code: "INVALID_POSTING",
        accountId: posting.accountId,
        reason: postingViolation.code,
      });
    }

    const account = accounts.get(posting.accountId);
    if (!account) {
      violations.push({ code: "ACCOUNT_NOT_FOUND", accountId: posting.accountId });
      continue;
    }
    if (account.profileId !== input.profileId) {
      violations.push({ code: "OWNERSHIP_MISMATCH", accountId: posting.accountId });
    }
    if (!isSupportedCurrencyCode(account.currencyCode)) {
      violations.push({
        code: "UNSUPPORTED_CURRENCY",
        accountId: posting.accountId,
        currencyCode: account.currencyCode,
      });
    }
  }

  const totalDebit = sum(input.postings.map((posting) => posting.debit));
  const totalCredit = sum(input.postings.map((posting) => posting.credit));
  if (totalDebit !== totalCredit) {
    violations.push({ code: "UNBALANCED", totalDebit, totalCredit });
  }

  return violations;
}

export function isBalancedTransaction(
  input: TransactionInput,
  accounts: ReadonlyMap<string, AccountRef>,
): boolean {
  return validateTransaction(input, accounts).length === 0;
}
