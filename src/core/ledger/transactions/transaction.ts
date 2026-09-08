import { isSupportedCurrencyCode } from "../../shared/currency";
import { validatePosting, type PostingInput, type PostingViolationCode } from "./posting";

export interface AccountRef {
  id: string;
  profileId: string;
  // Transaction Form FX UX delta — needed so the service layer can look up
  // a default CurrencyRate for this Account's own Currency (resolveCurrencyRate
  // is keyed by currencyId, not currencyCode).
  currencyId: string;
  currencyCode: string;
  currencyScale: number;
}

// The Profile's Base/Primary Currency — every Transaction's `base_amount`
// reconciles against this fixed target (Account Types, Money
// Representation, Rational Pricing, FX & Liability Details delta), not a
// dynamic "whichever leg is the credit side" choice like the old
// reconciliation-currency rule. Resolved by the caller (services/
// transactions.ts) from `profiles.primaryCurrencyId` before validation ever
// runs — a Profile with no resolvable Base Currency never reaches this
// function at all (see `NoBaseCurrencyError`).
export interface BaseCurrency {
  // Transaction Form FX UX delta — needed so the service layer can look up
  // a default CurrencyRate for the Base Currency side of a conversion
  // (resolveCurrencyRate is keyed by currencyId, not currencyCode).
  id: string;
  code: string;
  scale: number;
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
  | { code: "PRICE_MUST_BE_ONE"; accountId: string };

// Aggregate validation for a Transaction + its Postings. Pure — callers
// look up Accounts and the Profile's Base Currency and pass them in; this
// never touches a database. A persisted Transaction must produce zero
// violations (docs/03-accounting-principles.md, AGENTS.md rules #3-#7).
//
// Account Types, Money Representation, Rational Pricing, FX & Liability
// Details delta — replaces the old "reconciliation currency = the credit
// side's own currency, exactly one Conversion shape allowed" rule with a
// genuine N-leg one: any Posting may independently be cross-currency,
// reconciled via `base_amount` against the Profile's fixed Base Currency.
// There is no currency-count gate anymore (`MIXED_CURRENCY_UNSUPPORTED` is
// retired). Each `base_amount` is expected to already be correctly
// constructed by the caller (`core/ledger/transactions/baseAmount.ts`'s
// residual-ownership rule) — this function re-verifies the *result*
// (`SUM(base_amount) === 0`, per-posting invariants), it does not know or
// care which leg was the primary/payment leg at construction time.
export function validateTransaction(
  input: TransactionInput,
  accounts: ReadonlyMap<string, AccountRef>,
  baseCurrency: BaseCurrency,
): TransactionViolation[] {
  const violations: TransactionViolation[] = [];

  if (input.postings.length < 2) {
    violations.push({ code: "TOO_FEW_POSTINGS" });
  }

  let totalDebit = 0;
  let totalCredit = 0;

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

    // A posting's own `price` is always 1/1 when its Account currency
    // already matches the Base Currency — that's a property of the
    // exchange rate itself, true regardless of which leg is primary.
    // `baseAmount` is *not* checked against `units` here even in that
    // case — the transaction's primary/payment leg may legitimately be a
    // Base Currency posting whose `baseAmount` absorbs the other legs'
    // rounding residual (baseAmount.ts), so it can differ slightly from
    // its own `units`. This function doesn't know which leg was primary
    // (by design — see the module doc comment), so it can't distinguish
    // that case from a real corruption; `SUM(base_amount) === 0` below is
    // the check that actually catches a genuinely broken value.
    if (account.currencyCode === baseCurrency.code && posting.priceNum !== posting.priceDenom) {
      violations.push({ code: "PRICE_MUST_BE_ONE", accountId: posting.accountId });
    }

    if (posting.baseAmount > 0) {
      totalDebit += posting.baseAmount;
    } else {
      totalCredit += -posting.baseAmount;
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
  baseCurrency: BaseCurrency,
): boolean {
  return validateTransaction(input, accounts, baseCurrency).length === 0;
}
