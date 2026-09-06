// Common representation every broker tradebook adapter normalizes into
// (Stock tradebook import plan, 2026-09-06) — mirrors core/ledger/
// statements/import.ts's own NormalizedImportRow shape/role for Ledger's
// bank-statement adapters, kept as a separate Portfolio-domain type rather
// than reused across the ADR-040 delink (core/portfolio must not import
// core/ledger). A tradebook only ever has two transaction types (unlike
// InvestmentTransactionType's fuller BUY/SELL/DIVIDEND/BONUS/SPLIT/
// TRANSFER_IN/TRANSFER_OUT vocabulary) — narrower on purpose, mapped onto
// the fuller type only at the service layer (services/tradebookImport.ts).
export const TRADEBOOK_TRANSACTION_TYPES = ["BUY", "SELL"] as const;
export type TradebookTransactionType = (typeof TRADEBOOK_TRANSACTION_TYPES)[number];

export interface NormalizedTradebookRow {
  date: string;
  type: TradebookTransactionType;
  units: number;
  price: number;
  // Never guessed as identity (Portfolio's own "never name as identity"
  // posture, already applied to CAS scheme resolution) — a row with
  // neither is unresolvable, not matched by name.
  isin: string | null;
  symbol: string | null;
  // Provisional only — a tradebook rarely carries the company's full legal
  // name, just a trading symbol (casImport.ts's own Instrument-creation
  // posture: whatever identity string is available becomes the initial
  // name, corrected later by a real catalogue lookup if one exists).
  name: string | null;
  // The broker's own per-fill trade ID — distinct fills from one order can
  // otherwise share date/symbol/quantity/price and collapse into one
  // dedup-key match (confirmed real bug class, see services/
  // tradebookImport.ts's own dedupKey comment).
  tradeId: string | null;
}
