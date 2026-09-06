import { classifyHoldingIntegrity, netUnitsFromTransactions, type HoldingIntegrity, type Quantity } from "@/core";
import type { Db } from "../persistence/client";
import {
  findHoldingsByInstrument,
  findHoldingsByProfile,
  insertHolding,
  type HoldingRow,
} from "../repositories/holdings";
import { findInvestmentTransactionsByInstrument } from "../repositories/investmentTransactions";

export interface RecordHoldingInput {
  profileId: string;
  instrumentId: string;
  folioId?: string;
  asOfDate: string;
  units: number;
  source: "MANUAL" | "CAS_PDF" | "CSV_IMPORT" | "ECAS_PDF";
  sourceRef?: string;
}

// Persists an *observed* snapshot (schema.ts's own comment on `holdings`)
// — e.g. a CAS statement's reported closing balance, or a manually entered
// one. Never the computed position (see computeCurrentPosition below).
export function recordHolding(db: Db, input: RecordHoldingInput): HoldingRow {
  const now = new Date().toISOString();
  const holding: HoldingRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    instrumentId: input.instrumentId,
    folioId: input.folioId ?? null,
    asOfDate: input.asOfDate,
    units: input.units,
    source: input.source,
    sourceRef: input.sourceRef ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertHolding(db, holding);
  return holding;
}

export function listHoldings(db: Db, profileId: string): HoldingRow[] {
  return findHoldingsByProfile(db, profileId);
}

export function listHoldingsForInstrument(
  db: Db,
  profileId: string,
  instrumentId: string,
): HoldingRow[] {
  return findHoldingsByInstrument(db, profileId, instrumentId);
}

// The current position — always netted fresh from every recorded
// InvestmentTransaction for this Instrument, never read from the
// `holdings` table (core/portfolio/transactions/investmentTransaction.ts's
// own doc comment: "derived on read", same posture as Ledger's own
// accountBalance).
export function computeCurrentPosition(db: Db, profileId: string, instrumentId: string): Quantity {
  const transactions = findInvestmentTransactionsByInstrument(db, profileId, instrumentId);
  return netUnitsFromTransactions(transactions);
}

// Latest observed snapshot per Folio, summed — `holdings` rows are never
// deduped/upserted (each import just records another point-in-time
// observation, schema.ts's own comment), so re-importing the same
// statement can leave more than one row per (instrument, folio); only the
// most recent one per folio is still "the" observed position.
function latestObservedUnitsByFolio(rows: readonly HoldingRow[]): Quantity {
  const latestByFolio = new Map<string, HoldingRow>();
  for (const row of rows) {
    const key = row.folioId ?? "";
    const existing = latestByFolio.get(key);
    if (!existing || row.asOfDate > existing.asOfDate) latestByFolio.set(key, row);
  }
  return [...latestByFolio.values()].reduce((sum, row) => sum + row.units, 0);
}

// Cut-down integrity signal (analysis/folioman-vs-ledger/09-valuation-
// dedup-and-charts-gap-analysis.md §5) — does the transaction-implied
// position match what the statement itself last observed for this
// Instrument? `undefined` when there's no observed snapshot at all to
// compare against (nothing to contradict the transaction history, so
// there's no "Snapshot only" signal to show — this is different from a
// verified match).
export function getHoldingIntegrity(db: Db, profileId: string, instrumentId: string): HoldingIntegrity | undefined {
  const observedRows = findHoldingsByInstrument(db, profileId, instrumentId);
  if (observedRows.length === 0) return undefined;

  const observedUnits = latestObservedUnitsByFolio(observedRows);
  const transactionUnits = computeCurrentPosition(db, profileId, instrumentId);
  return classifyHoldingIntegrity(transactionUnits, observedUnits);
}
