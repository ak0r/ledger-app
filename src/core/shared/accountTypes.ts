// Account Types, Money Representation, Rational Pricing, FX & Liability
// Details delta — replaces the frozen 7-value `INSTRUMENT_TYPES` taxonomy
// (AGENTS.md rule #11, 2026-08-19) with a real, classification-driven
// vocabulary. Reverses ADR-015/rule #21's "Income and Expense have no
// Account Type" posture: every classification now has one, mandatory.
export const CLASSIFICATIONS = [
  "ASSET",
  "LIABILITY",
  "INCOME",
  "EXPENSE",
  "BALANCING",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

// BALANCING is system-managed (the one seeded "Opening Balance" mechanism,
// created via direct repository inserts in src/server/demo/dataset.ts, not
// through the Account Form or its Server Action) — not a classification a
// user picks when creating an account. `CLASSIFICATIONS` itself stays
// unrestricted (existing Balancing accounts must remain valid/editable);
// this is the one place that encodes "which classifications a *new*
// account may use," reused by both the New Account form and
// `createAccountSchema`'s server-side enforcement (rule #17 — hiding it
// from the picker alone isn't enough).
export const CREATABLE_CLASSIFICATIONS: readonly Exclude<Classification, "BALANCING">[] =
  CLASSIFICATIONS.filter(
    (classification): classification is Exclude<Classification, "BALANCING"> => classification !== "BALANCING",
  );

export const ACCOUNT_TYPES = [
  "CASH",
  "BANK",
  "INVESTMENTS",
  "WALLET",
  "RECEIVABLES",
  "CREDIT_CARD",
  "LOAN",
  "PAYABLES",
  "EARNED",
  "PASSIVE",
  "WINDFALL",
  "FIXED",
  "VARIABLE",
  "DISCRETIONARY",
  "FINANCIAL",
  "INITIAL",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// Every Classification has an Account Type vocabulary now — a full
// `Record`, not the old `Partial` (which only covered ASSET/LIABILITY).
// BALANCING's single value (`INITIAL`) is never offered in the user-facing
// New Account form (rule #22 — Balancing stays system-managed), but it's
// still a real, storable value for the one seeded Balancing account.
export const ACCOUNT_TYPES_BY_CLASSIFICATION: Record<Classification, readonly AccountType[]> = {
  ASSET: ["CASH", "BANK", "INVESTMENTS", "WALLET", "RECEIVABLES"],
  LIABILITY: ["CREDIT_CARD", "LOAN", "PAYABLES"],
  INCOME: ["EARNED", "PASSIVE", "WINDFALL"],
  EXPENSE: ["FIXED", "VARIABLE", "DISCRETIONARY", "FINANCIAL"],
  BALANCING: ["INITIAL"],
};

// The delta's own internal/search representation —
// `classification:accountType:name` (e.g. `assets:bank:hdfc`) — lowercase,
// colon-separated, always derived, never stored (this codebase never
// persists what it can derive). Not an arbitrary-depth hierarchy; just a
// display/search string. `name` is slugified: lowercased, non-alphanumeric
// runs collapsed to a single underscore, leading/trailing underscores
// trimmed.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function toAccountIdentity(account: {
  classification: Classification;
  accountType: AccountType;
  name: string;
}): string {
  return `${account.classification.toLowerCase()}:${account.accountType.toLowerCase()}:${slugify(account.name)}`;
}
