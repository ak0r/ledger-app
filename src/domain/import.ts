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
