import type { ZodError } from "zod";
import {
  BudgetAllocationValidationError,
  BudgetScopeValidationError,
  BudgetValidationError,
  CurrencyAlreadyAddedError,
  DashboardPanelValidationError,
  EmailAlreadyRegisteredError,
  IncorrectCurrentPasswordError,
  InvalidCredentialsError,
  InvestmentTransactionValidationError,
  MergeIneligibleError,
  MultiPanStatementError,
  NotFoundError,
  PanelConfigValidationError,
  PanMismatchError,
  PasswordRequiredError,
  RecurringRuleValidationError,
  TransactionValidationError,
  UnsupportedCurrencyError,
  UnsupportedImportFormatError,
  WrongStatementTypeError,
} from "../services/errors";

// `code` is optional and only set for a handful of errors the client needs
// to branch on structurally rather than just display (today: password-
// protected import files) — every other action's `{ success: false, error }`
// object literal stays valid as-is, since `code` is additive.
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function invalidInput(error: ZodError): ActionResult<never> {
  return { success: false, error: error.issues.map((issue) => issue.message).join("; ") };
}

// Domain/application errors are the real enforcement point (rule #17) — this
// only turns them into a serializable message for the client. It never
// re-derives *why* something failed; that reasoning already happened in
// Phase 3/4.
export function fromThrown(error: unknown): ActionResult<never> {
  if (error instanceof PasswordRequiredError) {
    return {
      success: false,
      error: error.message,
      code: error.reason === "incorrect" ? "PASSWORD_INCORRECT" : "PASSWORD_REQUIRED",
    };
  }
  if (
    error instanceof TransactionValidationError ||
    error instanceof InvestmentTransactionValidationError ||
    error instanceof RecurringRuleValidationError ||
    error instanceof BudgetValidationError ||
    error instanceof BudgetScopeValidationError ||
    error instanceof BudgetAllocationValidationError ||
    error instanceof DashboardPanelValidationError ||
    error instanceof PanelConfigValidationError ||
    error instanceof NotFoundError ||
    error instanceof UnsupportedCurrencyError ||
    error instanceof CurrencyAlreadyAddedError ||
    error instanceof MergeIneligibleError ||
    error instanceof InvalidCredentialsError ||
    error instanceof IncorrectCurrentPasswordError ||
    error instanceof EmailAlreadyRegisteredError ||
    error instanceof UnsupportedImportFormatError ||
    error instanceof PanMismatchError ||
    error instanceof MultiPanStatementError ||
    error instanceof WrongStatementTypeError
  ) {
    return { success: false, error: error.message };
  }
  throw error;
}
