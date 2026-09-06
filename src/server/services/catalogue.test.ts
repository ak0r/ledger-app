import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createInstrument } from "./instruments";
import { searchInstruments } from "../repositories/instruments";
import { refreshInstrumentCatalogue, type FetchJson } from "./catalogue";

const ANALYST_STOCKS = "https://analyst.indianapi.in/static/all_stocks.json";
const PRO_STOCKS = "https://pro.indianapi.in/static/all_stocks.json";
const ANALYST_MF = "https://analyst.indianapi.in/static/all_mf.json";

const STOCK_PAYLOAD = [
  { id: "S1", name: "ZIM Laboratories", "nse-code": "ZIMLAB", "bse-code": "541400" },
  { id: "S2", name: "HDFC Bank", "nse-code": "HDFCBANK", "bse-code": "500180" },
];

const MF_PAYLOAD = {
  Equity: { "Large Cap": [{ id: "MF1", mfMasterId: "MF1", mfName: "Parag Parikh Flexi Cap" }] },
};

function fetchFrom(responses: Record<string, unknown>): FetchJson {
  return vi.fn(async (url: string) => responses[url] ?? null);
}

describe("refreshInstrumentCatalogue", () => {
  it("ingests from the Analyst source when it's usable, without touching Pro", async () => {
    const db = createTestDb();
    const fetchJson = fetchFrom({ [ANALYST_STOCKS]: STOCK_PAYLOAD });

    const result = await refreshInstrumentCatalogue(db, "STOCK", fetchJson);

    expect(result).toEqual({ source: "analyst", upserted: 2 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson).toHaveBeenCalledWith(ANALYST_STOCKS);
    expect(searchInstruments(db, "STOCK", "HDFC", 10).map((i) => i.name)).toEqual(["HDFC Bank"]);
  });

  it("falls back to Pro when Analyst fails outright (fetchJson returns null)", async () => {
    const db = createTestDb();
    const fetchJson = fetchFrom({ [PRO_STOCKS]: STOCK_PAYLOAD });

    const result = await refreshInstrumentCatalogue(db, "STOCK", fetchJson);

    expect(result).toEqual({ source: "pro", upserted: 2 });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("falls back to Pro when Analyst returns a structurally-unusable response", async () => {
    const db = createTestDb();
    const fetchJson = fetchFrom({
      [ANALYST_STOCKS]: { not: "an array" },
      [PRO_STOCKS]: STOCK_PAYLOAD,
    });

    const result = await refreshInstrumentCatalogue(db, "STOCK", fetchJson);

    expect(result).toEqual({ source: "pro", upserted: 2 });
  });

  it("preserves the existing local catalogue when both sources fail", async () => {
    const db = createTestDb();
    const existing = createInstrument(db, { type: "STOCK", name: "Manually Added Co" });
    const fetchJson = fetchFrom({});

    const result = await refreshInstrumentCatalogue(db, "STOCK", fetchJson);

    expect(result).toEqual({ source: null, upserted: 0 });
    expect(searchInstruments(db, "STOCK", "Manually", 10)).toEqual([existing]);
  });

  it("upserts idempotently — refreshing twice updates in place rather than duplicating", async () => {
    const db = createTestDb();
    const fetchJson = fetchFrom({ [ANALYST_STOCKS]: STOCK_PAYLOAD });

    await refreshInstrumentCatalogue(db, "STOCK", fetchJson);
    const renamed = [{ ...STOCK_PAYLOAD[0], name: "ZIM Laboratories Ltd" }, STOCK_PAYLOAD[1]];
    const secondFetch = fetchFrom({ [ANALYST_STOCKS]: renamed });
    const result = await refreshInstrumentCatalogue(db, "STOCK", secondFetch);

    expect(result.upserted).toBe(2);
    const all = searchInstruments(db, "STOCK", "ZIM", 10);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("ZIM Laboratories Ltd");
  });

  it("never touches a user-created Instrument of the same type/name", async () => {
    const db = createTestDb();
    const userCreated = createInstrument(db, { type: "STOCK", name: "ZIM Laboratories" });
    const fetchJson = fetchFrom({ [ANALYST_STOCKS]: [STOCK_PAYLOAD[0]] });

    await refreshInstrumentCatalogue(db, "STOCK", fetchJson);

    const matches = searchInstruments(db, "STOCK", "ZIM", 10);
    expect(matches).toHaveLength(2);
    expect(matches.some((row) => row.id === userCreated.id && row.source === null)).toBe(true);
  });

  it("ingests mutual funds from the nested category/sub-category feed shape", async () => {
    const db = createTestDb();
    const fetchJson = fetchFrom({ [ANALYST_MF]: MF_PAYLOAD });

    const result = await refreshInstrumentCatalogue(db, "MUTUAL_FUND", fetchJson);

    expect(result).toEqual({ source: "analyst", upserted: 1 });
    expect(searchInstruments(db, "MUTUAL_FUND", "Flexi Cap", 10).map((i) => i.name)).toEqual([
      "Parag Parikh Flexi Cap",
    ]);
  });
});

describe("searchInstruments (repository)", () => {
  it("matches on NSE code, BSE code, and source id — not just name", async () => {
    const db = createTestDb();
    await refreshInstrumentCatalogue(db, "STOCK", fetchFrom({ [ANALYST_STOCKS]: STOCK_PAYLOAD }));

    expect(searchInstruments(db, "STOCK", "HDFCBANK", 10).map((i) => i.name)).toEqual(["HDFC Bank"]);
    expect(searchInstruments(db, "STOCK", "500180", 10).map((i) => i.name)).toEqual(["HDFC Bank"]);
    expect(searchInstruments(db, "STOCK", "S2", 10).map((i) => i.name)).toEqual(["HDFC Bank"]);
  });

  it("respects the limit", async () => {
    const db = createTestDb();
    await refreshInstrumentCatalogue(db, "STOCK", fetchFrom({ [ANALYST_STOCKS]: STOCK_PAYLOAD }));
    expect(searchInstruments(db, "STOCK", "S", 1)).toHaveLength(1);
  });
});
