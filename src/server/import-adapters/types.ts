import type { NormalizedImportRow } from "@/domain";

// Account Resolution delta (2026-08-26) §9 — an adapter also reports the
// source account identity it found (a full account number, a masked form,
// or null when the source has none, e.g. generic CSV) so the import
// pipeline can resolve/propose an Account without the user picking one
// upfront (§3).
export interface ParsedFile {
  rows: NormalizedImportRow[];
  accountIdentifier: string | null;
}

// Delta §5/§6 — an adapter owns understanding one source format only, never
// Ledger-specific categorization or accounting intelligence.
export interface ImportAdapter {
  // `institution.product.format`, e.g. "hdfc.account.xls" (delta §5) — the
  // generic-CSV fallback uses "generic.any.csv" (no institution detected).
  id: string;
  label: string;
  // Clean institution name for a proposed new-account name (e.g. "HDFC
  // Bank ••••0077", delta §16) — deliberately separate from `label`, which
  // may carry format/product detail ("HDFC Bank Account (XLS)") not wanted
  // in a Ledger account name.
  institutionLabel: string;
  // Whether this adapter can handle the uploaded file (§8) — checked
  // against the raw bytes, not just the filename, so a renamed/misnamed
  // file still gets detected correctly where possible.
  detect(filename: string, buffer: Buffer): boolean;
  // `minorUnitScale` comes from the resolved Account's Currency (ADR-022,
  // MVP single-currency-per-profile) — an adapter never hardcodes INR's 2
  // decimal places itself. `buffer` (not a decoded string) so both text
  // (CSV) and binary (XLS) formats share one transport shape end to end.
  // Always async (even though only the PDF adapter needs it) so every
  // adapter implements the same signature — PDF decryption/parsing via
  // pdfjs-dist is inherently Promise-based. `password` is used, if given,
  // only for that one call; never persisted anywhere (rule: never store a
  // statement password).
  parse(buffer: Buffer, minorUnitScale: number, password?: string): Promise<ParsedFile>;
}
