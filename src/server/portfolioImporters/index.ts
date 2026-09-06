import { zerodhaTradebookCsvAdapter } from "./zerodhaTradebookCsv";
import { genericTradebookCsvAdapter } from "./genericTradebookCsv";
import type { TradebookAdapter } from "./types";

export type { TradebookAdapter } from "./types";

// Broker-specific adapters registered before the generic fallback — same
// ordering rule as src/server/importers/index.ts: `genericTradebookCsvAdapter
// .detect()` always returns true, so it must stay last.
const TRADEBOOK_ADAPTERS: TradebookAdapter[] = [zerodhaTradebookCsvAdapter, genericTradebookCsvAdapter];

export function detectTradebookAdapter(filename: string, buffer: Buffer): TradebookAdapter | undefined {
  return TRADEBOOK_ADAPTERS.find((adapter) => adapter.detect(filename, buffer));
}

export function listTradebookAdapters(): TradebookAdapter[] {
  return TRADEBOOK_ADAPTERS;
}
