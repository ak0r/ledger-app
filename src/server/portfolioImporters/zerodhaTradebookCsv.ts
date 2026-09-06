import Papa from "papaparse";
import type { NormalizedTradebookRow, TradebookTransactionType } from "@/core";
import { parseAmount } from "../importers/shared";
import type { TradebookAdapter } from "./types";

// Zerodha Console's own Tradebook -> Equity -> CSV export (docs/import-
// tradebook.md's own worked example, verified against the shape it
// documents): `symbol, isin, trade_date, trade_type, quantity, price,
// trade_id, …` — column order and any extra columns (order_id, exchange,
// segment, series, auction, trade_type) don't matter, only these names do.
const REQUIRED_HEADERS = ["symbol", "isin", "trade_date", "trade_type", "quantity", "price"];

function parseType(raw: string): TradebookTransactionType | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "buy") return "BUY";
  if (normalized === "sell") return "SELL";
  return null;
}

export const zerodhaTradebookCsvAdapter: TradebookAdapter = {
  id: "zerodha.tradebook.csv",
  label: "Zerodha Tradebook (CSV)",
  detect(filename: string, buffer: Buffer): boolean {
    if (!/\.csv$/i.test(filename)) return false;
    try {
      const headerLine = buffer.toString("utf8").split("\n")[0] ?? "";
      const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
      return REQUIRED_HEADERS.every((required) => headers.includes(required));
    } catch {
      return false;
    }
  },
  async parse(buffer: Buffer): Promise<NormalizedTradebookRow[]> {
    const result = Papa.parse<Record<string, string>>(buffer.toString("utf8"), {
      header: true,
      skipEmptyLines: true,
    });

    const rows: NormalizedTradebookRow[] = [];
    for (const record of result.data) {
      const date = record.trade_date?.trim();
      const type = parseType(record.trade_type ?? "");
      const units = parseAmount(record.quantity ?? "");
      const price = parseAmount(record.price ?? "");
      if (!date || !type || units <= 0 || price <= 0) continue;

      const isin = record.isin?.trim() || null;
      const symbol = record.symbol?.trim() || null;
      rows.push({
        date,
        type,
        units,
        price,
        isin,
        symbol,
        name: symbol,
        tradeId: record.trade_id?.trim() || null,
      });
    }
    return rows;
  },
};
