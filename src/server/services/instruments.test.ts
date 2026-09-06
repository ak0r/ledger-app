import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createInstrument, getInstrument, listInstruments, searchInstruments } from "./instruments";

describe("createInstrument", () => {
  // Instruments need no Profile at all — asymmetric vs. every other entity
  // in this codebase (Instrument Model delta §2/§18: NOT Profile-scoped).
  it("persists a STOCK Instrument with no Profile involved", () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "STOCK", name: "HDFC Bank" });

    expect(instrument.type).toBe("STOCK");
    expect(instrument.name).toBe("HDFC Bank");
    expect(instrument.unitLabel).toBeNull();
  });

  it("persists a MUTUAL_FUND Instrument", () => {
    const db = createTestDb();
    const instrument = createInstrument(db, { type: "MUTUAL_FUND", name: "Index Fund" });
    expect(instrument.type).toBe("MUTUAL_FUND");
  });

  it("persists a COMMODITY Instrument with a unitLabel", () => {
    const db = createTestDb();
    const instrument = createInstrument(db, {
      type: "COMMODITY",
      name: "Gold",
      unitLabel: "10g",
    });
    expect(instrument.unitLabel).toBe("10g");
  });
});

describe("getInstrument / listInstruments", () => {
  it("round-trips a created Instrument", () => {
    const db = createTestDb();
    const created = createInstrument(db, { type: "STOCK", name: "TCS" });

    expect(getInstrument(db, created.id)).toEqual(created);
    expect(listInstruments(db)).toEqual([created]);
  });

  it("getInstrument returns undefined for an unknown id", () => {
    const db = createTestDb();
    expect(getInstrument(db, "nonexistent")).toBeUndefined();
  });
});

describe("searchInstruments", () => {
  it("matches by name, scoped to the requested type (Account form's picker)", () => {
    const db = createTestDb();
    const stock = createInstrument(db, { type: "STOCK", name: "TCS" });
    createInstrument(db, { type: "MUTUAL_FUND", name: "TCS-adjacent Fund" });

    expect(searchInstruments(db, "STOCK", "tcs")).toEqual([stock]);
  });

  it("returns nothing for a blank query — the picker shows a hint instead of the whole type", () => {
    const db = createTestDb();
    createInstrument(db, { type: "STOCK", name: "TCS" });

    expect(searchInstruments(db, "STOCK", "")).toEqual([]);
    expect(searchInstruments(db, "STOCK", "   ")).toEqual([]);
  });

  it("returns an empty list when nothing matches", () => {
    const db = createTestDb();
    createInstrument(db, { type: "COMMODITY", name: "Gold", unitLabel: "10g" });
    expect(searchInstruments(db, "COMMODITY", "silver")).toEqual([]);
  });
});
