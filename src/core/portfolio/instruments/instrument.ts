// Instrument catalogue's own frozen type list (Instrument Model delta,
// 2026-08-21 §2; independent of core/ledger's InstrumentType since the
// Ledger/Portfolio delink, 2026-09-05 — a Ledger Account can never be
// Instrument-backed again, so this no longer derives from or references
// core/ledger's account-type taxonomy at all).
export const INSTRUMENT_BACKED_TYPES = ["MUTUAL_FUND", "STOCK", "COMMODITY"] as const;
export type InstrumentBackedType = (typeof INSTRUMENT_BACKED_TYPES)[number];
