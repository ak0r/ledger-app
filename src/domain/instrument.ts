import type { InstrumentType } from "./account";

// Instrument Model delta (2026-08-21) §2 — a narrower slice of the frozen
// `INSTRUMENT_TYPES` taxonomy (AGENTS.md rule #11, untouched by this file).
// `INSTRUMENT_TYPES` also contains account-type-only values (BANK,
// CREDIT_CARD, LOAN, EXPENSE, INCOME, BALANCING) that never get a real
// Instrument row — only these three represent an external asset an
// Account can reference.
export const INSTRUMENT_BACKED_TYPES = [
  "MUTUAL_FUND",
  "STOCK",
  "COMMODITY",
] as const satisfies readonly InstrumentType[];
export type InstrumentBackedType = (typeof INSTRUMENT_BACKED_TYPES)[number];

export function isInstrumentBackedType(type: InstrumentType): type is InstrumentBackedType {
  return (INSTRUMENT_BACKED_TYPES as readonly InstrumentType[]).includes(type);
}
