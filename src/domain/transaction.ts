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
  | { code: "UNSUPPORTED_CURRENCY"; accountId: string; currencyCode: string }
  | { code: "MIXED_CURRENCY_UNSUPPORTED" };

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

  // Once Account.Currency is independently editable (currency-catalog delta),
  // postings in one Transaction can resolve to different currencies through
  // the ordinary transaction UI. A raw debit/credit sum is meaningless across
  // currencies, so a mixed-currency shape is rejected by default...
  const currencyCodes = new Set(
    input.postings
      .map((posting) => accounts.get(posting.accountId)?.currencyCode)
      .filter((code): code is string => code !== undefined),
  );

  // ...*unless* it's the one recognised Currency Conversion shape: exactly
  // two postings, exactly two currencies, one debit leg and one credit leg.
  // Recognised purely by that shape, not by any caller-supplied intent flag
  // — detecting >1 currency must not, by itself, imply conversion semantics
  // (a 3-posting mixed-currency transaction, or two postings that are both
  // debits, still isn't a conversion, still gets MIXED_CURRENCY_UNSUPPORTED
  // below). No persisted TransactionKind either way — this is re-derived
  // from the postings every time, never stored.
  //
  // A conversion is exempt from the balance check on purpose: "balanced"
  // has no meaning across two different currencies without an exchange
  // rate, and rule 5 of the Currency Conversion delta is explicit that no
  // rate is persisted — the two actual leg amounts (already validated
  // individually above: non-negative, exactly one side positive) are the
  // whole accounting fact.
  const isConversionShape =
    input.postings.length === 2 &&
    currencyCodes.size === 2 &&
    input.postings.filter((posting) => posting.debit > 0).length === 1 &&
    input.postings.filter((posting) => posting.credit > 0).length === 1;

  if (isConversionShape) {
    // No balance check — the two legs are independent by design.
  } else if (currencyCodes.size > 1) {
    violations.push({ code: "MIXED_CURRENCY_UNSUPPORTED" });
  } else {
    const totalDebit = sum(input.postings.map((posting) => posting.debit));
    const totalCredit = sum(input.postings.map((posting) => posting.credit));
    if (totalDebit !== totalCredit) {
      violations.push({ code: "UNBALANCED", totalDebit, totalCredit });
    }
  }

  return violations;
}

export function isBalancedTransaction(
  input: TransactionInput,
  accounts: ReadonlyMap<string, AccountRef>,
): boolean {
  return validateTransaction(input, accounts).length === 0;
}
