import { hdfcAccountXlsAdapter } from "./hdfcAccountXls";
import { axisAccountXlsAdapter } from "./axisAccountXls";
import { idfcFirstAccountXlsAdapter } from "./idfcFirstAccountXls";
import { federalAccountPdfAdapter } from "./federalAccountPdf";
import { genericCsvAdapter } from "./genericCsv";
import type { ImportAdapter } from "./types";

export type { ImportAdapter, ParsedFile } from "./types";

// Institution-specific adapters registered before the generic fallback —
// `detectAdapter` tries them in order, and `genericCsvAdapter.detect()`
// always returns true, so it must stay last (delta §8's "appropriate
// fallback such as generic parsing/manual source selection").
const IMPORT_ADAPTERS: ImportAdapter[] = [
  hdfcAccountXlsAdapter,
  axisAccountXlsAdapter,
  idfcFirstAccountXlsAdapter,
  federalAccountPdfAdapter,
  genericCsvAdapter,
];
const IMPORT_ADAPTERS_BY_ID = new Map(IMPORT_ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function detectAdapter(filename: string, buffer: Buffer): ImportAdapter | undefined {
  return IMPORT_ADAPTERS.find((adapter) => adapter.detect(filename, buffer));
}

export function resolveAdapter(sourceId: string): ImportAdapter | undefined {
  return IMPORT_ADAPTERS_BY_ID.get(sourceId);
}

export function listImportAdapters(): ImportAdapter[] {
  return IMPORT_ADAPTERS;
}
