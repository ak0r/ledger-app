import { describe, expect, it } from "vitest";
import { fetchNseLatestQuote, parseNseHistoryCsv, type RawFetch } from "./nseEquityHistory";

// Synthetic fixture matching NSE's real security-wise historical CSV
// export shape (column set trimmed to what the parser reads — AGENTS.md
// rule #24, fake prices throughout).
const SAMPLE_CSV = `"Symbol","Series","Date","Prev Close","Open Price","High Price","Low Price","Last Price","Close Price","Average Price","Total Traded Quantity","Turnover","No. of Trades","Deliverable Qty","% Dly Qt to Traded Qty"
"EXAMPLECO","EQ","05-Jun-2026","990.00","995.00","1,010.00","985.00","1,000.00","1,000.00","997.50","1000000","999999999.99","5000","500000","50.00"
"EXAMPLECO","EQ","08-Jun-2026","1,000.00","1,005.00","1,270.00","1,000.00","1,263.30","1,263.30","1,200.00","1000000","999999999.99","5000","500000","50.00"
`;

describe("parseNseHistoryCsv", () => {
  it("parses Date + Close Price, converting to YYYY-MM-DD and stripping comma grouping", () => {
    const points = parseNseHistoryCsv(SAMPLE_CSV);
    expect(points).toEqual([
      { date: "2026-06-05", price: 1000 },
      { date: "2026-06-08", price: 1263.3 },
    ]);
  });

  it("returns an empty array for a non-CSV/empty body", () => {
    expect(parseNseHistoryCsv("")).toEqual([]);
    expect(parseNseHistoryCsv("<html>error</html>")).toEqual([]);
  });

  it("tolerates a leading UTF-8 BOM", () => {
    const points = parseNseHistoryCsv("﻿" + SAMPLE_CSV);
    expect(points).toHaveLength(2);
  });
});

describe("fetchNseLatestQuote", () => {
  it("returns null when the symbol is empty", async () => {
    expect(await fetchNseLatestQuote("")).toBeNull();
  });

  it("returns null when the warmup/history request throws", async () => {
    const failingFetch: RawFetch = (async () => {
      throw new Error("network down");
    }) as RawFetch;
    expect(await fetchNseLatestQuote("EXAMPLECO", failingFetch)).toBeNull();
  });

  it("returns null on a non-CSV (WAF/HTML) response", async () => {
    let call = 0;
    const htmlFetch: RawFetch = (async () => {
      call += 1;
      if (call === 1) return new Response("", { status: 200, headers: { "set-cookie": "nseappid=abc" } });
      return new Response("<html>blocked</html>", { status: 200, headers: { "content-type": "text/html" } });
    }) as RawFetch;
    expect(await fetchNseLatestQuote("EXAMPLECO", htmlFetch)).toBeNull();
  });

  it("returns the most recent point from a successful CSV response", async () => {
    let call = 0;
    const okFetch: RawFetch = (async () => {
      call += 1;
      if (call === 1) return new Response("", { status: 200, headers: { "set-cookie": "nseappid=abc" } });
      return new Response(SAMPLE_CSV, { status: 200, headers: { "content-type": "text/csv" } });
    }) as RawFetch;
    expect(await fetchNseLatestQuote("EXAMPLECO", okFetch)).toEqual({ date: "2026-06-08", price: 1263.3 });
  });
});
