import type { ZodError } from "zod";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  MergeIneligibleError,
  NotFoundError,
  TransactionValidationError,
  UnsupportedCurrencyError,
} from "../use-cases/errors";

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

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
  if (
    error instanceof TransactionValidationError ||
    error instanceof NotFoundError ||
    error instanceof UnsupportedCurrencyError ||
    error instanceof MergeIneligibleError ||
    error instanceof InvalidCredentialsError ||
    error instanceof EmailAlreadyRegisteredError
  ) {
    return { success: false, error: error.message };
  }
  throw error;
}
