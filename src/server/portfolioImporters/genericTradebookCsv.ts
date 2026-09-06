import Papa from "papaparse";
import type { NormalizedTradebookRow, TradebookTransactionType } from "@/core";
import { UnsupportedImportFormatError } from "../services/errors";
import { parseAmount } from "../importers/shared";
import type { TradebookAdapter } from "./types";

// Same header-alias-matching style as Ledger's own genericCsv.ts (plain
// case-insensitive matching against fixed alias lists, no fuzzy/confidence
// scoring, no client-side column-mapping wizard) — the always-last
// fallback for a broker this app has no dedicated adapter for yet.
const DATE_COLUMNS = ["date", "trade_date"];
const TYPE_COLUMNS = ["type", "transaction_type", "trade_type", "side"];
const UNITS_COLUMNS = ["units", "quantity", "qty"];
const PRICE_COLUMNS = ["price", "rate"];
const ISIN_COLUMNS = ["isin"];
const SYMBOL_COLUMNS = ["symbol", "scrip", "name"];
const TRADE_ID_COLUMNS = ["trade_id", "source_ref", "order_id"];

function findColumn(headers: readonly string[], candidates: readonly string[]): string | undefined {
  return headers.find((header) => candidates.includes(header.trim().toLowerCase()));
}

function parseType(raw: string): TradebookTransactionType | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "buy" || normalized === "b") return "BUY";
  if (normalized === "sell" || normalized === "s") return "SELL";
  return null;
}

export const genericTradebookCsvAdapter: TradebookAdapter = {
  id: "generic.tradebook.csv",
  label: "Generic Tradebook CSV",
  detect(): boolean {
    return true;
  },
  async parse(buffer: Buffer): Promise<NormalizedTradebookRow[]> {
    const result = Papa.parse<Record<string, string>>(buffer.toString("utf8"), {
      header: true,
      skipEmptyLines: true,
    });

    const headers = result.meta.fields ?? [];
    const dateColumn = findColumn(headers, DATE_COLUMNS);
    const typeColumn = findColumn(headers, TYPE_COLUMNS);
    const unitsColumn = findColumn(headers, UNITS_COLUMNS);
    const priceColumn = findColumn(headers, PRICE_COLUMNS);
    if (!dateColumn || !typeColumn || !unitsColumn || !priceColumn) {
      throw new UnsupportedImportFormatError(
        `expected "date", "type"/"trade_type", "units"/"quantity", and "price" columns`,
      );
    }
    const isinColumn = findColumn(headers, ISIN_COLUMNS);
    const symbolColumn = findColumn(headers, SYMBOL_COLUMNS);
    const tradeIdColumn = findColumn(headers, TRADE_ID_COLUMNS);

    const rows: NormalizedTradebookRow[] = [];
    for (const record of result.data) {
      const date = record[dateColumn]?.trim();
      const type = parseType(record[typeColumn] ?? "");
      const units = parseAmount(record[unitsColumn] ?? "");
      const price = parseAmount(record[priceColumn] ?? "");
      if (!date || !type || units <= 0 || price <= 0) continue;

      const symbol = symbolColumn ? record[symbolColumn]?.trim() || null : null;
      rows.push({
        date,
        type,
        units,
        price,
        isin: isinColumn ? record[isinColumn]?.trim() || null : null,
        symbol,
        name: symbol,
        tradeId: tradeIdColumn ? record[tradeIdColumn]?.trim() || null : null,
      });
    }
    return rows;
  },
};
