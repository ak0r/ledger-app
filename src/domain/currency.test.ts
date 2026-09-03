import { describe, expect, it } from "vitest";
import { isSupportedCurrencyCode, findCurrencyDefinition, CURRENCY_CATALOG } from "./currency";

describe("isSupportedCurrencyCode", () => {
  it("accepts every code in the Currency Catalogue", () => {
    for (const currency of CURRENCY_CATALOG) {
      expect(isSupportedCurrencyCode(currency.code)).toBe(true);
    }
  });

  it("rejects a code not in the Currency Catalogue", () => {
    expect(isSupportedCurrencyCode("ZZZ")).toBe(false);
  });
});

describe("findCurrencyDefinition", () => {
  it("returns the definition for a supported code", () => {
    expect(findCurrencyDefinition("INR")).toEqual({
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });
  });

  it("returns undefined for an unsupported code", () => {
    expect(findCurrencyDefinition("ZZZ")).toBeUndefined();
  });
});
