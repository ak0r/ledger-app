import { hdfcAccountXlsAdapter } from "./hdfcAccountXls";
import { axisAccountXlsAdapter } from "./axisAccountXls";
import { idfcFirstAccountXlsAdapter } from "./idfcFirstAccountXls";
import { federalAccountPdfAdapter } from "./federalAccountPdf";
import { gpayPdfAdapter } from "./gpayPdf";
import { genericCsvAdapter } from "./genericCsv";
import { AmbiguousImportFormatError, UnrecognizedImportFormatError } from "../services/errors";
import type { ImportAdapter, ParsedFile } from "./types";

export type { ImportAdapter, ParsedFile } from "./types";

// Custom Importer's own public surface (Ledger Custom Importer delta) —
// re-exported here rather than reached via their own file paths, same
// "one import boundary per module" posture as the adapter exports above.
export { readXlsRows } from "./shared";
export { buildRowsFromMapping, suggestColumnMapping } from "./customImportMapping";
export { extractCroppedTable, getPageCount } from "./pdfTextExtraction";

// Institution-specific adapters registered before the generic fallback —
// `genericCsvAdapter.detect()` always returns true, so it must stay last
// (delta §8's "appropriate fallback such as generic parsing/manual source
// selection"). Registration order only matters as a tie-break for which
// candidate's `parse()` runs first — see `resolveImport` below, which
// tries every candidate rather than stopping at the first `detect()` hit.
const IMPORT_ADAPTERS: ImportAdapter[] = [
  hdfcAccountXlsAdapter,
  axisAccountXlsAdapter,
  idfcFirstAccountXlsAdapter,
  federalAccountPdfAdapter,
  gpayPdfAdapter,
  genericCsvAdapter,
];
const IMPORT_ADAPTERS_BY_ID = new Map(IMPORT_ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function resolveAdapter(sourceId: string): ImportAdapter | undefined {
  return IMPORT_ADAPTERS_BY_ID.get(sourceId);
}

export function listImportAdapters(): ImportAdapter[] {
  return IMPORT_ADAPTERS;
}

// Ledger Custom Importer delta — replaces the old "first `detect()` match
// wins" model. `detect()` stays cheap/synchronous candidate discovery
// (unchanged for every adapter); `parse()` is now the authoritative check.
// A candidate whose `parse()` throws `UnrecognizedImportFormatError` isn't
// actually a match after all (e.g. Federal Bank's PDF adapter can only
// check magic bytes in `detect()` — real confirmation needs the page text,
// which needs a password first) — try the next candidate instead of
// failing outright. Any other throw (a real parse failure on content this
// adapter *does* recognize as its own, or `PasswordRequiredError`) is not
// swallowed — it propagates immediately, and no further candidates are
// tried. Registered adapters will keep growing over time, so this scales
// with the registry instead of being keyed to today's specific list.
// Exported separately from `resolveImport` (below) so the resolution
// *logic* is unit-testable against stub adapters, without exercising any
// real adapter's own parsing.
export async function resolveImportFrom(
  adapters: readonly ImportAdapter[],
  filename: string,
  buffer: Buffer,
  minorUnitScale: number,
  password?: string,
): Promise<{ adapter: ImportAdapter; parsed: ParsedFile }> {
  const candidates = adapters.filter((adapter) => adapter.detect(filename, buffer));

  const matches: { adapter: ImportAdapter; parsed: ParsedFile }[] = [];
  for (const adapter of candidates) {
    try {
      const parsed = await adapter.parse(buffer, minorUnitScale, password);
      matches.push({ adapter, parsed });
    } catch (error) {
      if (error instanceof UnrecognizedImportFormatError) continue;
      throw error;
    }
  }

  if (matches.length === 0) {
    throw new UnrecognizedImportFormatError("no registered importer recognized this file");
  }
  if (matches.length > 1) {
    throw new AmbiguousImportFormatError(matches.map((match) => match.adapter.label));
  }
  return matches[0]!;
}

export async function resolveImport(
  filename: string,
  buffer: Buffer,
  minorUnitScale: number,
  password?: string,
): Promise<{ adapter: ImportAdapter; parsed: ParsedFile }> {
  return resolveImportFrom(IMPORT_ADAPTERS, filename, buffer, minorUnitScale, password);
}
