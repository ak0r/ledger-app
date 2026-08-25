import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createInstrument, getInstrument, listInstruments } from "./instruments";

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
