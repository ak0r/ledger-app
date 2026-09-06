import type { Quantity } from "../../shared/quantity";

// Cut-down version of Folioman's `SecurityIntegrityStatus` (analysis/
// folioman-vs-ledger/09-valuation-dedup-and-charts-gap-analysis.md §5) —
// no persisted table, no 5-state machine, no background reconciliation
// job. Just: does the transaction-implied position match the statement's
// own observed snapshot for the same (Instrument, Folio)? A CAS statement
// only ever covers the period it was requested for, never necessarily a
// scheme's full since-inception history — a mismatch here means the
// imported transaction history doesn't go back far enough to be trusted
// for cost-basis/XIRR, even though the current *value* (units x NAV) is
// still correct (it uses the observed snapshot, not the transaction sum).
export type HoldingIntegrity = "VERIFIED" | "SNAPSHOT_ONLY";

// Statement-reported balances are typically precise to 3-4 decimal
// places; a few minor units of drift from independent rounding on each
// side isn't a real mismatch. 100 minor units = 0.0001 real units at
// Quantity's fixed 6-decimal scale (core/shared/quantity.ts).
const TOLERANCE_MINOR_UNITS = 100;

export function classifyHoldingIntegrity(transactionUnits: Quantity, observedUnits: Quantity): HoldingIntegrity {
  return Math.abs(transactionUnits - observedUnits) <= TOLERANCE_MINOR_UNITS ? "VERIFIED" : "SNAPSHOT_ONLY";
}
