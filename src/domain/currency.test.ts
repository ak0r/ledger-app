import { describe, expect, it } from "vitest";
import { isSupportedCurrencyCode } from "./currency";

describe("isSupportedCurrencyCode", () => {
  it("accepts INR", () => {
    expect(isSupportedCurrencyCode("INR")).toBe(true);
  });

  it("rejects any other currency (MVP-only, ADR-020)", () => {
    expect(isSupportedCurrencyCode("JPY")).toBe(false);
    expect(isSupportedCurrencyCode("USD")).toBe(false);
  });
});
