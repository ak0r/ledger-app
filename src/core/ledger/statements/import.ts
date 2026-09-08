import type { AccountType, Classification } from "@/core/shared/accountTypes";

// Import Framework Phase 1 delta (2026-08-25), vocabulary updated by the
// Account Resolution delta (2026-08-26) §2 — import history must never
// expose accounting-workflow states like "Committed"/"Approved", only
// "Successful"/"Failed". Phase 1 never persists an intermediate lifecycle
// state (see use-cases/imports.ts) and its atomic commit means "failed"
// isn't reachable yet either — only "successful" is ever written — but the
// type stays open for a future staging/partial-commit phase.
export const IMPORT_STATUSES = ["successful", "failed"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

// Which side of the *known* account's ledger the statement row hit — not
// the accounting debit/credit of the eventual Posting (Account Resolution
// decides that once both legs are known).
export type ImportDirection = "debit" | "credit";

// Common representation every adapter normalizes into (delta §6). Provider
// formats end here — everything downstream (Account Resolution, Preview,
// Commit) operates only on this shape.
export interface NormalizedImportRow {
  date: string;
  description: string;
  amountMinor: number;
  direction: ImportDirection;
  reference?: string;
  metadata?: string;
  // A per-row source-account identity (e.g. a masked bank/card suffix a
  // wallet/UPI-app export tags each transaction with) — for a source with
  // no single owning account of its own (GPay), unlike `ParsedFile.
  // accountIdentifier` (`server/importers/types.ts`), which is one
  // identity for the *whole file* (a bank/CC statement's own account).
  // Optional and unrelated to it: an adapter with a real file-level
  // account (every existing bank/CC adapter) never sets this; leave unset
  // and every row falls back to the file-level resolution exactly as
  // before.
  accountIdentifier?: string | null;
  // Time of day, "HH:MM" 24-hour, when the source actually shows one
  // (GPay does; a typical bank statement's own daily ledger doesn't) —
  // cross-source reconciliation (`lib/duplicate-detection.ts`) uses it as
  // a tie-breaker only when *both* sides being compared have one; a
  // same-date match never requires it.
  time?: string;
  // A comparable counterparty token, when the adapter's own format has
  // one to extract (e.g. GPay's "Paid to X"/"Received from X", or Axis's
  // own UPI narration's embedded name segment) — used the same
  // if-available way as `time` by `lib/duplicate-detection.ts`, never
  // required when either side lacks one (self-transfers, ATM withdrawals,
  // bank charges, and similar rows legitimately have no "other party").
  counterparty?: string;
  // GPay importer delta — when `accountIdentifier` is set but turns out
  // not to match any existing Account, this is what to propose creating
  // instead of silently falling back to the file's own single default (a
  // real bug: a credit-card-routed row was landing on whatever account
  // the *rest* of the file resolved to, never surfaced as its own "new
  // Account" proposal at all). The adapter is the only place that still
  // has the original text ("Federal Bank XX97 | RuPay credit card") to
  // tell a bank account from a credit card — unset for every adapter that
  // never sets `accountIdentifier` either.
  proposedAccountName?: string;
  proposedAccountType?: AccountType;
  proposedAccountClassification?: Extract<Classification, "ASSET" | "LIABILITY">;
}

// Delta §7's locked default mapping when the counter-account can't be
// resolved: a statement debit against the known account reads as money
// leaving it (Expense-shaped), a credit reads as money entering it
// (Income-shaped). Both are ordinary, already-frozen classifications (rule
// #11) — no new "Unknown" instrument type is introduced.
export interface UnknownCounterAccount {
  classification: "EXPENSE" | "INCOME";
  name: "Unknown";
}

export function resolveUnknownCounterAccount(direction: ImportDirection): UnknownCounterAccount {
  return {
    classification: direction === "debit" ? "EXPENSE" : "INCOME",
    name: "Unknown",
  };
}
