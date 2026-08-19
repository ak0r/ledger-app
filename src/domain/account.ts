// ADR-024 — frozen MVP instrument taxonomy. ADR-015 — classification
// determines accounting meaning; instrument type does not. Const arrays
// (not just union types) so callers — including client-side Zod schemas —
// can enumerate the values at runtime instead of duplicating the list.
export const CLASSIFICATIONS = [
  "ASSET",
  "LIABILITY",
  "INCOME",
  "EXPENSE",
  "BALANCING",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const INSTRUMENT_TYPES = [
  "BANK",
  "CASH",
  "CREDIT_CARD",
  "LOAN",
  "EXPENSE",
  "INCOME",
  "BALANCING",
] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];
