import { describe, expect, it } from "vitest";
import { fetchYahooLatestQuote, parseYahooChart, type RawFetch } from "./yahooFinance";

// Synthetic fixture matching Yahoo's real chart JSON shape (trimmed to the
// fields the parser reads — AGENTS.md rule #24, fake price throughout).
// The trailing null pair mirrors Yahoo's own real behaviour: the most
// recent bar is padded with null until that day's session closes.
const SAMPLE_CHART = {
  chart: {
    result: [
      {
        timestamp: [1749340200, 1749599400, 1749685800],
        indicators: { quote: [{ close: [1000, 1263.3, null] }] },
      },
    ],
  },
};

describe("parseYahooChart", () => {
  it("returns the most recent non-null close, converting the epoch timestamp to YYYY-MM-DD", () => {
    expect(parseYahooChart(SAMPLE_CHART)).toEqual({ date: "2025-06-10", price: 1263.3 });
  });

  it("returns null for a malformed/empty response", () => {
    expect(parseYahooChart({})).toBeNull();
    expect(parseYahooChart(null)).toBeNull();
    expect(parseYahooChart({ chart: { result: [] } })).toBeNull();
  });
});

describe("fetchYahooLatestQuote", () => {
  it("returns null when there's no nseCode or bseCode to build a symbol from", async () => {
    expect(await fetchYahooLatestQuote(null, null)).toBeNull();
  });

  it("builds a .NS symbol from nseCode, preferred over bseCode", async () => {
    let requestedUrl = "";
    const okFetch: RawFetch = (async (url: string) => {
      requestedUrl = url;
      return new Response(JSON.stringify(SAMPLE_CHART), { status: 200 });
    }) as RawFetch;

    const quote = await fetchYahooLatestQuote("EXAMPLECO", "500001", okFetch);
    expect(requestedUrl).toContain("/EXAMPLECO.NS?");
    expect(quote).toEqual({ date: "2025-06-10", price: 1263.3 });
  });

  it("builds a .BO symbol when only bseCode is set", async () => {
    let requestedUrl = "";
    const okFetch: RawFetch = (async (url: string) => {
      requestedUrl = url;
      return new Response(JSON.stringify(SAMPLE_CHART), { status: 200 });
    }) as RawFetch;

    await fetchYahooLatestQuote(null, "500001", okFetch);
    expect(requestedUrl).toContain("/500001.BO?");
  });

  it("returns null when the request throws or responds with a non-OK status", async () => {
    const failingFetch: RawFetch = (async () => {
      throw new Error("network down");
    }) as RawFetch;
    expect(await fetchYahooLatestQuote("EXAMPLECO", null, failingFetch)).toBeNull();

    const notOkFetch: RawFetch = (async () => new Response("", { status: 429 })) as RawFetch;
    expect(await fetchYahooLatestQuote("EXAMPLECO", null, notOkFetch)).toBeNull();
  });
});
