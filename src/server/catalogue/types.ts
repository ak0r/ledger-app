// Instrument Catalogue delta (2026-09-04) — a source-agnostic shape the
// ingestion use-case (src/server/services/catalogue.ts) upserts into
// `instruments`. Each source module (indianApiStocks.ts, indianApiMf.ts)
// normalizes its own raw feed into this before anything touches the DB.
export interface NormalizedCatalogueInstrument {
  sourceId: string;
  name: string;
  nseCode: string | null;
  bseCode: string | null;
  isin: string | null;
}

// The two Instrument types this delta ingests a catalogue for — COMMODITY
// has no catalogue source yet (delta §1, spec's own non-goal), it stays
// user-created only via createInstrument.
export type CatalogueInstrumentType = "STOCK" | "MUTUAL_FUND";
