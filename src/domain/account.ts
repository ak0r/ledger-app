// ADR-024 — frozen MVP instrument taxonomy (2026-08-19 delta: added
// MUTUAL_FUND/STOCK/COMMODITY, see AGENTS.md rule #11). ADR-015 —
// classification determines accounting meaning; instrument type does not.
// Const arrays (not just union types) so callers — including client-side
// Zod schemas — can enumerate the values at runtime instead of duplicating
// the list.
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

export const INSTRUMENT_TYPES = [
  "BANK",
  "CASH",
  "CREDIT_CARD",
  "LOAN",
  "EXPENSE",
  "INCOME",
  "BALANCING",
  "MUTUAL_FUND",
  "STOCK",
  "COMMODITY",
] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

// Account Type only exists where it changes real behaviour (2026-08-19
// delta §19.1) — Asset and Liability have meaningfully different types
// (Mutual Fund needs quantity/price/valuation eventually; Bank doesn't).
// Income and Expense deliberately have *no* entry here: "Salary" vs.
// "Freelance Income" vs. "Rent" are account names, not types — they're all
// accounting-identical (still just `INCOME`/`EXPENSE` under the hood,
// unchanged from before this delta). Balancing also has no entry (system-
// managed, no user-facing type choice). A `Partial` map, not a full
// `Record` — a classification's *absence* from this map is itself the
// signal the Account Form reads to decide whether to render a Type step
// at all, and downstream consumers that need "does this classification
// have types" can just check `in`/`[classification] !== undefined`.
export const TYPES_BY_CLASSIFICATION: Partial<Record<Classification, readonly InstrumentType[]>> = {
  ASSET: ["CASH", "BANK", "MUTUAL_FUND", "STOCK", "COMMODITY"],
  LIABILITY: ["CREDIT_CARD", "LOAN"],
};
