import { describe, expect, it } from "vitest";
import { genericTradebookCsvAdapter } from "./genericTradebookCsv";
import { UnsupportedImportFormatError } from "../services/errors";

describe("genericTradebookCsvAdapter", () => {
  it("always detects (the universal fallback)", () => {
    expect(genericTradebookCsvAdapter.detect("anything.csv", Buffer.from(""))).toBe(true);
  });

  it("parses via header aliases (date/type/units/price, not Zerodha's own names)", async () => {
    const csv = "date,type,units,price,isin\n2026-02-01,buy,5,200,INF000X01111\n";
    const rows = await genericTradebookCsvAdapter.parse(Buffer.from(csv));
    expect(rows).toEqual([
      { date: "2026-02-01", type: "BUY", units: 5, price: 200, isin: "INF000X01111", symbol: null, name: null, tradeId: null },
    ]);
  });

  it("throws when required columns are missing", async () => {
    await expect(genericTradebookCsvAdapter.parse(Buffer.from("a,b\n1,2\n"))).rejects.toThrow(
      UnsupportedImportFormatError,
    );
  });
});
