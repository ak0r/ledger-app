import type { NormalizedTradebookRow } from "@/core";

// Sibling to src/server/importers/ (Ledger's own bank-statement adapters),
// deliberately a separate directory rather than reusing that one — keeps
// the two import pipelines as cleanly delinked as core/ledger and core/
// portfolio already are (ADR-040). Same interface shape as Ledger's own
// `ImportAdapter` (src/server/importers/types.ts) for a consistent mental
// model, minus what a tradebook never carries: no `accountIdentifier` (a
// tradebook has no demat-account identity inside the file at all — the
// user picks/creates the destination PortfolioAccount+Folio up front,
// services/tradebookImport.ts's own comment explains why), and no
// `minorUnitScale`/`password` parse arguments (a tradebook is never
// encrypted, and price/units stay plain numbers here — currency-scale
// conversion happens once, at commit time, same as CAS import).
export interface TradebookAdapter {
  // `institution.product.format`, e.g. "zerodha.tradebook.csv" — the
  // generic fallback uses "generic.tradebook.csv" (no broker detected).
  id: string;
  label: string;
  detect(filename: string, buffer: Buffer): boolean;
  parse(buffer: Buffer): Promise<NormalizedTradebookRow[]>;
}
