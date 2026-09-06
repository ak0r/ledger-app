import { describe, expect, it } from "vitest";
import { normalizeMutualFundCatalogue, normalizeStockCatalogue } from "./normalize";

describe("normalizeStockCatalogue", () => {
  it("normalizes a well-formed record", () => {
    const result = normalizeStockCatalogue([
      { id: "S0000719", name: "ZIM Laboratories", "nse-code": "ZIMLAB", "bse-code": "541400" },
    ]);
    expect(result).toEqual([
      { sourceId: "S0000719", name: "ZIM Laboratories", nseCode: "ZIMLAB", bseCode: "541400", isin: null },
    ]);
  });

  it("normalizes empty and literal-\"null\" exchange codes to real null (delta §2)", () => {
    const result = normalizeStockCatalogue([
      { id: "S1", name: "Empty NSE", "nse-code": "", "bse-code": "123" },
      { id: "S2", name: "Literal null NSE", "nse-code": "null", "bse-code": "456" },
      { id: "S3", name: "Missing NSE key", "bse-code": "789" },
    ]);
    expect(result?.map((r) => r.nseCode)).toEqual([null, null, null]);
  });

  it("drops a record missing a required field instead of failing the whole batch", () => {
    const result = normalizeStockCatalogue([
      { id: "S1", name: "Good Co" },
      { id: "S2" }, // no name
      { name: "No id Co" }, // no id
    ]);
    expect(result?.map((r) => r.name)).toEqual(["Good Co"]);
  });

  it("returns null for a response that isn't an array at all", () => {
    expect(normalizeStockCatalogue({ not: "an array" })).toBeNull();
    expect(normalizeStockCatalogue(null)).toBeNull();
  });
});

describe("normalizeMutualFundCatalogue", () => {
  it("flattens category -> sub-category -> fund[] into a flat list", () => {
    const result = normalizeMutualFundCatalogue({
      Debt: {
        "Floating Rate": [{ id: "MF1", mfMasterId: "MF1", mfName: "Axis Floater Fund", lastestNav: "1229.90" }],
      },
      Equity: {
        "Large Cap": [{ id: "MF2", mfMasterId: "MF2", mfName: "Parag Parikh Flexi Cap" }],
      },
    });
    expect(result).toEqual([
      { sourceId: "MF1", name: "Axis Floater Fund", nseCode: null, bseCode: null, isin: null },
      { sourceId: "MF2", name: "Parag Parikh Flexi Cap", nseCode: null, bseCode: null, isin: null },
    ]);
  });

  it("drops a fund record missing a required field", () => {
    const result = normalizeMutualFundCatalogue({
      Debt: { "Floating Rate": [{ id: "MF1", mfName: "Good Fund" }, { id: "MF2" }] },
    });
    expect(result?.map((r) => r.name)).toEqual(["Good Fund"]);
  });

  it("returns null for a response that isn't an object at all", () => {
    expect(normalizeMutualFundCatalogue([1, 2, 3])).toBeNull();
    expect(normalizeMutualFundCatalogue("nope")).toBeNull();
    expect(normalizeMutualFundCatalogue(null)).toBeNull();
  });
});
