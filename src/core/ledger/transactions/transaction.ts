import { isSupportedCurrencyCode } from "../../shared/currency";
import { fromMinorUnits } from "../../shared/money";
import { fromQuantityMinorUnits, toQuantityMinorUnits } from "../../shared/quantity";
import { validatePosting, type PostingInput, type PostingViolationCode } from "./posting";

export interface AccountRef {
  id: string;
  profileId: string;
  currencyCode: string;
  // Revised Investment Model delta (2026-09-03) — needed to convert a
  // posting's own decimal amount into/out of the fixed Quantity scale,
  // and to compute reconciliation values at the reconciliation currency's
  // own precision.
  currencyScale: number;
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
  | { code: "MIXED_CURRENCY_UNSUPPORTED" }
  | { code: "QUANTITY_MISMATCH"; accountId: string }
  | { code: "PRICE_MUST_BE_ONE"; accountId: string };

// Aggregate validation for a Transaction + its Postings. Pure — callers
// look up Accounts and pass them in; this never touches a database. A
// persisted Transaction must produce zero violations (docs/
// 03-accounting-principles.md, AGENTS.md rules #3-#7).
//
// Revised Investment Model delta (2026-09-03) — replaces the old raw-
// minor-units debit/credit sum with a generalised reconciliation-value
// rule: every posting's `quantity x price`, converted into the
// transaction's *reconciliation currency* (by convention, the credit
// side's own currency — same "From = credit side" convention already
// used everywhere else, e.g. lib/transaction-rows.ts), must balance
// debit-side against credit-side. A same-currency transaction reduces to
// exactly today's old behaviour (every price is forced to 1, so
// quantity IS the amount and the sum is the same raw-minor-units
// comparison as before) — a strict generalisation, not a new rule for
// the common case.
//
// Ledger/Portfolio delink (2026-09-05, analysis/folioman-vs-ledger/
// 06-pwa-validation-and-domain-delink.md) — every posting's `quantity`
// must mirror its own debit/credit amount; there is no longer an
// Instrument-backed exception. Portfolio's own future InvestmentTransaction
// gets its own independent unit-count/price concept, entirely outside this
// table (Ledger `postings` never carries one again).
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

    const expectedQuantity = toQuantityMinorUnits(
      fromMinorUnits(posting.debit || posting.credit, account.currencyScale),
    );
    if (posting.quantity !== expectedQuantity) {
      violations.push({ code: "QUANTITY_MISMATCH", accountId: posting.accountId });
    }
  }

  // Mixed-currency shape gate — unchanged in spirit from before this
  // delta: a mixed-currency transaction is rejected unless it's exactly
  // the one recognised Currency Conversion shape (two postings, two
  // currencies, one debit leg, one credit leg). Detecting >1 currency
  // must not, by itself, imply conversion semantics or unlock N-way
  // multi-currency splits — that's real scope this delta doesn't touch,
  // easy to revisit later, not implied by the reconciliation-value math
  // below just because it happens to generalise that far.
  const allCurrencyCodes = new Set(
    input.postings
      .map((posting) => accounts.get(posting.accountId)?.currencyCode)
      .filter((code): code is string => code !== undefined),
  );
  const isConversionShape =
    input.postings.length === 2 &&
    allCurrencyCodes.size === 2 &&
    input.postings.filter((posting) => posting.debit > 0).length === 1 &&
    input.postings.filter((posting) => posting.credit > 0).length === 1;

  if (allCurrencyCodes.size > 1 && !isConversionShape) {
    violations.push({ code: "MIXED_CURRENCY_UNSUPPORTED" });
    return violations;
  }

  // Reconciliation currency = the credit side's own currency. Undefined
  // when there's no resolvable credit-side account at all — a malformed
  // shape already reported above (TOO_FEW_POSTINGS/ACCOUNT_NOT_FOUND),
  // nothing left to reconcile against.
  const reconciliationAccount = input.postings
    .filter((posting) => posting.credit > 0)
    .map((posting) => accounts.get(posting.accountId))
    .find((account): account is AccountRef => account !== undefined);
  if (!reconciliationAccount) {
    return violations;
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const posting of input.postings) {
    const account = accounts.get(posting.accountId);
    if (!account) continue;

    const isReconciliationCurrency = account.currencyCode === reconciliationAccount.currencyCode;
    if (isReconciliationCurrency && posting.price !== 1) {
      violations.push({ code: "PRICE_MUST_BE_ONE", accountId: posting.accountId });
    }

    const reconciliationValue = Math.round(
      fromQuantityMinorUnits(posting.quantity) * posting.price * 10 ** reconciliationAccount.currencyScale,
    );
    if (posting.debit > 0) {
      totalDebit += reconciliationValue;
    } else {
      totalCredit += reconciliationValue;
    }
  }

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
