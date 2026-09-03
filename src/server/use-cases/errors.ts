import type {
  BudgetAllocationViolation,
  BudgetScopeViolation,
  BudgetViolation,
  DashboardPanelViolation,
  PanelConfigViolation,
  RecurringRuleViolation,
  TransactionViolation,
} from "@/domain";

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
    case "MIXED_CURRENCY_UNSUPPORTED":
      return "This transaction mixes more than one currency — every account in a transaction must use the same currency.";
  }
}

export class TransactionValidationError extends Error {
  constructor(public readonly violations: readonly TransactionViolation[]) {
    super(violations[0] ? describeTransactionViolation(violations[0]) : "Transaction failed domain validation");
    this.name = "TransactionValidationError";
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
