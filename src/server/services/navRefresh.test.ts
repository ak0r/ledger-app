import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createInstrument } from "./instruments";
import { getLatestNav, recordNav } from "./navHistory";
import { refreshAllNav, runNavRefreshIfDue } from "./navRefresh";
import type { FetchText } from "../priceFeeds/amfiNav";
import type { RawFetch } from "../priceFeeds/nseEquityHistory";

// Synthetic fixture matching NSE's real historical-CSV shape — see
// priceFeeds/nseEquityHistory.test.ts for the fuller parser test.
const SAMPLE_NSE_CSV = `"Symbol","Series","Date","Close Price"
"EXAMPLECO","EQ","08-Jun-2026","1,263.30"
`;

function stubRawFetch(): RawFetch {
  let call = 0;
  return (async () => {
    call += 1;
    if (call % 2 === 1) return new Response("", { status: 200, headers: { "set-cookie": "nseappid=abc" } });
    return new Response(SAMPLE_NSE_CSV, { status: 200, headers: { "content-type": "text/csv" } });
  }) as RawFetch;
}

// Same shape rule as amfiNav.test.ts's fixture — synthetic scheme, real
// NAVAll.txt structure.
const SYNTHETIC_NAV_ALL = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
120503;INF000X01234;-;Example Flexi Cap Fund - Growth;123.4567;01-Jul-2026
120999;-;-;Example AMFI-Only Fund;50.0000;01-Jul-2026
`;

function stubFetch(text: string | null): FetchText {
  return async () => text;
}

// `refreshStockNav` shares one `rawFetch` between both feeds (Phase 4's
// "NSE preferred, Yahoo is the fallback" wiring), so a single stub tells
// the two feeds apart by request URL — NSE's own domain always misses
// (an HTML/WAF-shaped response), Yahoo's always hits.
const SAMPLE_YAHOO_CHART = {
  chart: { result: [{ timestamp: [1749599400], indicators: { quote: [{ close: [1500.5] }] } }] },
};

function stubNseMissesYahooHits(): RawFetch {
  return (async (url: string) => {
    if (String(url).includes("nseindia.com")) {
      return new Response("", { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response(JSON.stringify(SAMPLE_YAHOO_CHART), { status: 200 });
  }) as RawFetch;
}

describe("refreshAllNav", () => {
  it("upserts NAV for a catalogued Mutual Fund resolved by ISIN", async () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "MUTUAL_FUND", name: "Example Flexi Cap", isin: "INF000X01234" });

    const result = await refreshAllNav(db, stubFetch(SYNTHETIC_NAV_ALL));

    expect(result.instrumentsUpdated).toBe(1);
    expect(getLatestNav(db, instrument.id)?.nav).toBe(123.4567);
  });

  it("falls back to AMFI code when the Instrument has no ISIN", async () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "MUTUAL_FUND", name: "Example AMFI-Only", amfiCode: "120999" });

    await refreshAllNav(db, stubFetch(SYNTHETIC_NAV_ALL));

    expect(getLatestNav(db, instrument.id)?.nav).toBe(50);
  });

  it("skips a Mutual Fund with neither ISIN nor AMFI code, and a STOCK with no NSE code", async () => {
    const db = createTestDb();
    createInstrument(db, { type: "MUTUAL_FUND", name: "No Identity" });
    // Has an ISIN, but ISIN isn't what the equity feed looks up by — no
    // nseCode means nothing to query.
    createInstrument(db, { type: "STOCK", name: "Some Stock", isin: "INF000X01234" });

    const result = await refreshAllNav(db, stubFetch(SYNTHETIC_NAV_ALL));

    expect(result.instrumentsChecked).toBe(0);
    expect(result.instrumentsUpdated).toBe(0);
  });

  it("upserts NAV for a STOCK Instrument resolved by NSE code", async () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "STOCK", name: "Example Co", isin: "INF000X09999", nseCode: "EXAMPLECO" });

    const result = await refreshAllNav(db, stubFetch(null), stubRawFetch());

    expect(result.instrumentsUpdated).toBe(1);
    expect(getLatestNav(db, instrument.id)?.nav).toBe(1263.3);
  });

  it("refreshes both Mutual Fund and Stock Instruments in one call", async () => {
    const db = createTestDb();
    const mf = createInstrument(db, { type: "MUTUAL_FUND", name: "Example Flexi Cap", isin: "INF000X01234" });
    const stock = createInstrument(db, { type: "STOCK", name: "Example Co", isin: "INF000X09999", nseCode: "EXAMPLECO" });

    const result = await refreshAllNav(db, stubFetch(SYNTHETIC_NAV_ALL), stubRawFetch());

    expect(result.instrumentsChecked).toBe(2);
    expect(result.instrumentsUpdated).toBe(2);
    expect(getLatestNav(db, mf.id)?.nav).toBe(123.4567);
    expect(getLatestNav(db, stock.id)?.nav).toBe(1263.3);
  });

  it("falls back to Yahoo when NSE returns nothing for a Stock", async () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "STOCK", name: "Example Co", isin: "INF000X09999", nseCode: "EXAMPLECO" });

    const result = await refreshAllNav(db, stubFetch(null), stubNseMissesYahooHits());

    expect(result.instrumentsUpdated).toBe(1);
    const latest = getLatestNav(db, instrument.id);
    expect(latest?.nav).toBe(1500.5);
    expect(latest?.source).toBe("YAHOO");
  });

  it("does nothing (not throw) when the feed is unreachable", async () => {
    const db = createTestDb();
    createInstrument(db, { type: "MUTUAL_FUND", name: "Example", isin: "INF000X01234" });

    const result = await refreshAllNav(db, stubFetch(null));

    expect(result).toEqual({ instrumentsChecked: 0, instrumentsUpdated: 0 });
  });

  it("re-running updates the same row rather than accumulating duplicates for one date", async () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "MUTUAL_FUND", name: "Example", isin: "INF000X01234" });

    await refreshAllNav(db, stubFetch(SYNTHETIC_NAV_ALL));
    await refreshAllNav(db, stubFetch(SYNTHETIC_NAV_ALL));

    expect(getLatestNav(db, instrument.id)?.nav).toBe(123.4567);
  });
});

describe("runNavRefreshIfDue", () => {
  it("refreshes when no NAV has ever been recorded", async () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "MUTUAL_FUND", name: "Example", isin: "INF000X01234" });

    await runNavRefreshIfDue(db, stubFetch(SYNTHETIC_NAV_ALL));

    expect(getLatestNav(db, instrument.id)?.nav).toBe(123.4567);
  });

  it("does not re-fetch when the most recent NAV row is still within the interval", async () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "MUTUAL_FUND", name: "Example", isin: "INF000X01234" });
    recordNav(db, { instrumentId: instrument.id, date: "2026-06-30", nav: 1, source: "AMFI" });

    await runNavRefreshIfDue(db, stubFetch(SYNTHETIC_NAV_ALL));

    // The pre-seeded NAV stays untouched — a real refresh would have
    // overwritten it via the fixture's 123.4567.
    expect(getLatestNav(db, instrument.id)?.nav).toBe(1);
  });
});
