import type { InstrumentBackedType } from "@/core";
import type { Db } from "../persistence/client";
import {
  findAllInstruments,
  findInstrumentById,
  insertInstrument,
  searchInstruments as searchInstrumentsRepo,
  type InstrumentRow,
} from "../repositories/instruments";

export interface CreateInstrumentInput {
  type: InstrumentBackedType;
  name: string;
  unitLabel?: string;
  // Set by CAS import (services/casImport.ts) when a scheme's ISIN wasn't
  // already in the catalogue — a real identifier discovered from a
  // statement, not catalogue provenance (`source`/`sourceId` still stay
  // null: this didn't come from IndianAPI ingestion).
  isin?: string;
  // Fallback identity CAS import uses when a scheme has no ISIN at all,
  // and the identity the AMFI bulk NAV feed keys off (services/
  // priceFeeds/amfiNav.ts).
  amfiCode?: string;
  // Set by tradebook import (services/tradebookImport.ts) from the
  // broker's own trading-symbol column — the identity the NSE equity price
  // feed keys off (services/priceFeeds/nseEquityHistory.ts). A best-effort
  // guess, not a catalogue-verified NSE code: most Indian brokers already
  // use the NSE trading symbol directly for an NSE-listed stock, so this
  // is right far more often than not, and a wrong/BSE-only guess just
  // means that one Instrument's price feed silently finds nothing (never a
  // crash) until a real catalogue link corrects it.
  nseCode?: string;
  // BSE counterpart of `nseCode` — set by demat eCAS import (services/
  // ecasImport.ts) when casparser's own backfilled `equity.exchange` says
  // BSE rather than NSE, the first source in this codebase to actually
  // distinguish the two (tradebook import only ever populates `nseCode`).
  bseCode?: string;
}

export function createInstrument(db: Db, input: CreateInstrumentInput): InstrumentRow {
  const now = new Date().toISOString();
  const instrument: InstrumentRow = {
    id: crypto.randomUUID(),
    type: input.type,
    name: input.name,
    unitLabel: input.unitLabel ?? null,
    // Instrument Catalogue delta (2026-09-04) — a user-created Instrument
    // has no catalogue provenance; null here is what keeps it invisible to
    // upsertCatalogueInstruments's (source, sourceId) identity match.
    source: null,
    sourceId: null,
    nseCode: input.nseCode ?? null,
    bseCode: input.bseCode ?? null,
    isin: input.isin ?? null,
    amfiCode: input.amfiCode ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertInstrument(db, instrument);
  return instrument;
}

export function getInstrument(db: Db, id: string): InstrumentRow | undefined {
  return findInstrumentById(db, id);
}

export function listInstruments(db: Db): InstrumentRow[] {
  return findAllInstruments(db);
}

// Account form's Instrument picker (Instrument Catalogue delta,
// 2026-09-04) — one search round trip per keystroke (debounced client-
// side), against the local catalogue only (delta §5). An empty/blank
// query returns no results rather than the whole (potentially ~5600-row)
// type — the picker's own empty state tells the user to type instead.
const SEARCH_RESULT_LIMIT = 25;

export function searchInstruments(db: Db, type: InstrumentBackedType, query: string): InstrumentRow[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  return searchInstrumentsRepo(db, type, trimmed, SEARCH_RESULT_LIMIT);
}
