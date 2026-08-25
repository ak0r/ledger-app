import type { TransactionViolation } from "@/domain";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class TransactionValidationError extends Error {
  constructor(public readonly violations: readonly TransactionViolation[]) {
    super("Transaction failed domain validation");
    this.name = "TransactionValidationError";
  }
}

export class UnsupportedCurrencyError extends Error {
  constructor(code: string) {
    super(`Unsupported currency code "${code}" — MVP supports INR only (ADR-020)`);
    this.name = "UnsupportedCurrencyError";
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
