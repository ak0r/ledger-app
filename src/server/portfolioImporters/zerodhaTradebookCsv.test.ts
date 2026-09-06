import { describe, expect, it } from "vitest";
import { zerodhaTradebookCsvAdapter } from "./zerodhaTradebookCsv";

// Synthetic fixture matching Zerodha Console's real Tradebook -> Equity ->
// CSV export shape (verified against Folioman's own sanitized test
// fixture for the real column names/order) — fake symbol/ISIN/prices
// throughout (AGENTS.md rule #24).
const SAMPLE_CSV = `symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
EXAMPLECO,INF000X09999,2026-01-15,NSE,EQ,EQ,buy,false,10.000000,1000.000000,T1,O1,2026-01-15T10:30:00
EXAMPLECO,INF000X09999,2026-06-15,NSE,EQ,EQ,sell,false,4.000000,1200.000000,T2,O2,2026-06-15T11:00:00
`;

describe("zerodhaTradebookCsvAdapter.detect", () => {
  it("detects a real Zerodha header row in a .csv file", () => {
    expect(zerodhaTradebookCsvAdapter.detect("tradebook.csv", Buffer.from(SAMPLE_CSV))).toBe(true);
  });

  it("rejects a non-csv filename even with matching headers", () => {
    expect(zerodhaTradebookCsvAdapter.detect("tradebook.xlsx", Buffer.from(SAMPLE_CSV))).toBe(false);
  });

  it("rejects a csv missing the required headers", () => {
    expect(zerodhaTradebookCsvAdapter.detect("other.csv", Buffer.from("a,b,c\n1,2,3\n"))).toBe(false);
  });
});

describe("zerodhaTradebookCsvAdapter.parse", () => {
  it("parses buy/sell rows with ISIN, symbol, and trade ID", async () => {
    const rows = await zerodhaTradebookCsvAdapter.parse(Buffer.from(SAMPLE_CSV));

    expect(rows).toEqual([
      { date: "2026-01-15", type: "BUY", units: 10, price: 1000, isin: "INF000X09999", symbol: "EXAMPLECO", name: "EXAMPLECO", tradeId: "T1" },
      { date: "2026-06-15", type: "SELL", units: 4, price: 1200, isin: "INF000X09999", symbol: "EXAMPLECO", name: "EXAMPLECO", tradeId: "T2" },
    ]);
  });

  it("skips a row with an unrecognized trade_type", async () => {
    const csv = SAMPLE_CSV.replace("buy", "bonus");
    const rows = await zerodhaTradebookCsvAdapter.parse(Buffer.from(csv));
    expect(rows).toHaveLength(1);
  });
});
