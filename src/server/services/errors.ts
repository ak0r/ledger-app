import type {
  BudgetAllocationViolation,
  BudgetScopeViolation,
  BudgetViolation,
  DashboardPanelViolation,
  InvestmentTransactionViolation,
  PanelConfigViolation,
  RecurringRuleViolation,
  TransactionViolation,
} from "@/core";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// One human-readable line per violation code — used only for the message
// surfaced to the user (`ActionResult.error`); `violations` itself stays
// the full structured list for any caller that needs to branch on it.
// Reports the *first* violation only, matching how most of this app's
// validation-error messages already work (single-line, not a bulleted
// dump) — a Transaction with multiple simultaneous violations is rare and
// the first one is enough to point the user at the actual problem.
function describeTransactionViolation(violation: TransactionViolation): string {
  switch (violation.code) {
    case "TOO_FEW_POSTINGS":
      return "A transaction needs at least two postings.";
    case "UNBALANCED":
      return "Debits and credits don't balance.";
    case "INVALID_POSTING":
      return "One of the postings has an invalid amount.";
    case "ACCOUNT_NOT_FOUND":
      return "One of the selected accounts could not be found.";
    case "OWNERSHIP_MISMATCH":
      return "One of the selected accounts doesn't belong to this profile.";
    case "UNSUPPORTED_CURRENCY":
      return `${violation.currencyCode} isn't a supported currency.`;
    case "PRICE_MUST_BE_ONE":
      return "One of the postings has an invalid price.";
  }
}

export class TransactionValidationError extends Error {
  constructor(public readonly violations: readonly TransactionViolation[]) {
    super(violations[0] ? describeTransactionViolation(violations[0]) : "Transaction failed domain validation");
    this.name = "TransactionValidationError";
  }
}

function describeInvestmentTransactionViolation(violation: InvestmentTransactionViolation): string {
  switch (violation.code) {
    case "NON_POSITIVE_UNITS":
      return "Units must be greater than zero.";
    case "NON_POSITIVE_PRICE":
      return "Price must be greater than zero.";
    case "AMOUNT_MISMATCH":
      return "Units x price doesn't equal the entered amount.";
  }
}

export class InvestmentTransactionValidationError extends Error {
  constructor(public readonly violations: readonly InvestmentTransactionViolation[]) {
    super(
      violations[0]
        ? describeInvestmentTransactionViolation(violations[0])
        : "Investment transaction failed domain validation",
    );
    this.name = "InvestmentTransactionValidationError";
  }
}

export class RecurringRuleValidationError extends Error {
  constructor(public readonly violations: readonly RecurringRuleViolation[]) {
    super("Recurring rule failed domain validation");
    this.name = "RecurringRuleValidationError";
  }
}

export class BudgetValidationError extends Error {
  constructor(public readonly violations: readonly BudgetViolation[]) {
    super("Budget failed domain validation");
    this.name = "BudgetValidationError";
  }
}

export class DashboardPanelValidationError extends Error {
  constructor(public readonly violations: readonly DashboardPanelViolation[]) {
    super("Dashboard panel failed domain validation");
    this.name = "DashboardPanelValidationError";
  }
}

export class PanelConfigValidationError extends Error {
  constructor(public readonly violations: readonly PanelConfigViolation[]) {
    super("Panel configuration failed domain validation");
    this.name = "PanelConfigValidationError";
  }
}

export class BudgetScopeValidationError extends Error {
  constructor(public readonly violations: readonly BudgetScopeViolation[]) {
    super("Budget scope failed domain validation");
    this.name = "BudgetScopeValidationError";
  }
}

export class BudgetAllocationValidationError extends Error {
  constructor(public readonly violations: readonly BudgetAllocationViolation[]) {
    super("Budget allocation failed domain validation");
    this.name = "BudgetAllocationValidationError";
  }
}

// A Transaction's `base_amount` reconciles against the Profile's
// `primaryCurrencyId` (Account Types, Money Representation, Rational
// Pricing, FX & Liability Details delta) — a Profile can exist before any
// Currency has been created for it (that stays nullable at the schema
// level), but a Transaction can never be created/edited until one is
// resolvable. Thrown before domain validation even runs, same posture as
// `UnsupportedCurrencyError`.
export class NoBaseCurrencyError extends Error {
  constructor() {
    super("This Profile has no Primary Currency set yet — add one in Currency Settings before creating a transaction.");
    this.name = "NoBaseCurrencyError";
  }
}

// FX Rate UX delta — `UNIQUE(currency_id, date)` at the DB layer already
// prevents this; caught explicitly at the service layer first so the user
// sees a clear message instead of a raw SQLite constraint error.
export class DuplicateCurrencyRateError extends Error {
  constructor(date: string) {
    super(`A rate for ${date} already exists — edit or delete it instead of adding another.`);
    this.name = "DuplicateCurrencyRateError";
  }
}


export class UnsupportedCurrencyError extends Error {
  constructor(code: string) {
    super(`Unsupported currency code "${code}" — not in the Currency Catalogue`);
    this.name = "UnsupportedCurrencyError";
  }
}

export class CurrencyAlreadyAddedError extends Error {
  constructor(code: string) {
    super(`${code} has already been added to this Profile`);
    this.name = "CurrencyAlreadyAddedError";
  }
}

// A business-rule rejection (same date/currency/common account —
// src/lib/merge-eligibility.ts), not a domain posting/balance violation
// (TransactionValidationError's closed TransactionViolation union isn't
// extended for this — it's an application-layer concern, not a domain one).
export class MergeIneligibleError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "MergeIneligibleError";
  }
}

// Deliberately generic — covers both "no AppUser with this email" and
// "wrong password" with the same message, so a login failure never reveals
// whether an email is registered.
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class IncorrectCurrentPasswordError extends Error {
  constructor() {
    super("Current password is incorrect");
    this.name = "IncorrectCurrentPasswordError";
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`An account already exists for ${email}`);
    this.name = "EmailAlreadyRegisteredError";
  }
}

// A Profile can be linked to at most one AppUser (2026-08-20 User
// Simplification delta) — thrown when a registration link targets a
// Profile that's already linked, so it falls back to creating a fresh
// Profile instead of silently stealing/erroring on someone else's.
export class ProfileAlreadyLinkedError extends Error {
  constructor(profileId: string) {
    super(`Profile ${profileId} is already linked to an AppUser`);
    this.name = "ProfileAlreadyLinkedError";
  }
}

// Generic CSV adapter couldn't find a recognizable date/description +
// debit-credit-or-amount-direction column set in the uploaded file's header
// row (Import Framework Phase 1 delta §5).
export class UnsupportedImportFormatError extends Error {
  constructor(reason: string) {
    super(`Unsupported import file format: ${reason}`);
    this.name = "UnsupportedImportFormatError";
  }
}

// A candidate adapter's own `detect()` said "maybe" (a cheap, sometimes
// necessarily loose check — e.g. Federal Bank's PDF adapter can only check
// magic bytes before password-protected content is ever readable), but its
// `parse()` then determined the file isn't actually a match after all
// (Ledger Custom Importer delta — `resolveImport`, `server/importers/
// index.ts`). Distinct from `UnsupportedImportFormatError`: this means
// "not mine, try the next candidate / fall back to Custom Importer," never
// "recognized as mine but broken" — resolveImport only treats this one
// error type as non-fatal for a candidate; every other throw (including
// PasswordRequiredError) still propagates immediately.
export class UnrecognizedImportFormatError extends Error {
  constructor(reason: string) {
    super(`Could not recognize this file's format: ${reason}`);
    this.name = "UnrecognizedImportFormatError";
  }
}

// More than one registered adapter's `parse()` succeeded on the same file
// (Ledger Custom Importer delta) — with today's adapter set this shouldn't
// actually be reachable (each institution-specific adapter's own `detect()`
// already does a real content check, and the two format-agnostic adapters,
// Federal PDF and generic CSV, can't both parse the same bytes), but a
// future adapter could collide. Surfaced honestly rather than silently
// picking one, per the same "review new source data before guessing"
// posture as PAN mismatch/wrong-statement-type rejection elsewhere in this
// codebase.
export class AmbiguousImportFormatError extends Error {
  constructor(matchedLabels: readonly string[]) {
    super(`Multiple importers recognized this file (${matchedLabels.join(", ")}) — this needs a closer look.`);
    this.name = "AmbiguousImportFormatError";
  }
}

// A CAS PDF's own investor PAN (casparser's per-folio `PAN` field) doesn't
// match this Profile's registered PAN (`profiles.panHash`) — thrown before
// anything from the statement is persisted (Portfolio Adoption Plan's PAN
// hash/equality pattern, now actually enforced at CAS import time). A
// Profile with no PAN registered yet never hits this — that's a soft
// warning on the import page, not a hard failure.
export class PanMismatchError extends Error {
  constructor() {
    super("This statement's PAN doesn't match the PAN on file for this Profile.");
    this.name = "PanMismatchError";
  }
}

// Folioman's own `ecas_investor_identity` cross-check, ported: every demat
// account in one eCAS statement must agree on a single investor PAN — a
// multi-PAN statement (e.g. a joint/shared file) is rejected outright
// rather than guessing which owner is "the" Profile.
export class MultiPanStatementError extends Error {
  constructor() {
    super("This statement lists more than one PAN across its demat accounts — nothing was imported.");
    this.name = "MultiPanStatementError";
  }
}

// The MF CAS and demat eCAS import paths each expect casparser to return
// the shape their own type guard recognizes (casImport/runCasParser.ts's
// `isEcasResult`) — uploading the other kind is a clear, actionable
// rejection here rather than the undefined-property crash that reading
// e.g. `parsed.folios` off an eCAS result (or `parsed.accounts` off a CAS
// one) would otherwise produce.
export class WrongStatementTypeError extends Error {
  constructor(expected: "CAS" | "ECAS") {
    super(
      expected === "ECAS"
        ? 'This looks like a demat eCAS statement — use "Import eCAS" instead.'
        : 'This looks like a Mutual Fund CAS statement — use "Import CAS" instead.',
    );
    this.name = "WrongStatementTypeError";
  }
}

// Password-protected import file (Federal Bank Account PDF adapter) — the
// password itself is never persisted anywhere: it exists only for the
// single `adapter.parse()` call that needs it to decrypt the file, and is
// discarded once that call returns (rule: never store it). `reason`
// distinguishes "never tried one" (first upload) from "tried one, it was
// wrong" (retry) so the UI can show the right prompt copy.
export class PasswordRequiredError extends Error {
  constructor(public readonly reason: "required" | "incorrect" = "required") {
    super(reason === "incorrect" ? "Incorrect password" : "This file is password-protected");
    this.name = "PasswordRequiredError";
  }
}
