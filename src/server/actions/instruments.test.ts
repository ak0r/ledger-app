import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createInstrumentCore, searchInstrumentsCore } from "./instruments.core";

describe("createInstrumentCore", () => {
  it("creates an Instrument", () => {
    const db = createTestDb();
    const result = createInstrumentCore(db, { type: "STOCK", name: "TCS" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name — fast client feedback", () => {
    const db = createTestDb();
    const result = createInstrumentCore(db, { type: "STOCK", name: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects a type outside the Instrument-backed set (e.g. BANK)", () => {
    const db = createTestDb();
    const result = createInstrumentCore(db, { type: "BANK", name: "HDFC" });
    expect(result.success).toBe(false);
  });
});

describe("searchInstrumentsCore", () => {
  it("returns only Instruments of the requested type that match the query", () => {
    const db = createTestDb();
    createInstrumentCore(db, { type: "STOCK", name: "TCS" });
    createInstrumentCore(db, { type: "MUTUAL_FUND", name: "Index Fund" });

    const result = searchInstrumentsCore(db, { type: "STOCK", query: "tcs" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.map((i) => i.name)).toEqual(["TCS"]);
    }
  });
});
