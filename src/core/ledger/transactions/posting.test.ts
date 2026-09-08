import { describe, expect, it } from "vitest";
import { validatePosting } from "./posting";

describe("validatePosting", () => {
  it("accepts positive units (debit)", () => {
    expect(validatePosting({ accountId: "a", units: 5000, priceNum: 1, priceDenom: 1, baseAmount: 5000 })).toEqual(
      [],
    );
  });

  it("accepts negative units (credit)", () => {
    expect(
      validatePosting({ accountId: "a", units: -5000, priceNum: 1, priceDenom: 1, baseAmount: -5000 }),
    ).toEqual([]);
  });

  it("rejects zero units", () => {
    const violations = validatePosting({ accountId: "a", units: 0, priceNum: 1, priceDenom: 1, baseAmount: 0 });
    expect(violations).toContainEqual({ code: "INVALID_UNITS", accountId: "a" });
  });

  it("rejects fractional units (money is integer minor units)", () => {
    const violations = validatePosting({ accountId: "a", units: 50.5, priceNum: 1, priceDenom: 1, baseAmount: 50 });
    expect(violations).toContainEqual({ code: "INVALID_UNITS", accountId: "a" });
  });

  it("rejects zero/negative/non-integer priceNum or priceDenom", () => {
    expect(
      validatePosting({ accountId: "a", units: 5000, priceNum: 0, priceDenom: 1, baseAmount: 5000 }),
    ).toContainEqual({ code: "PRICE_NOT_POSITIVE", accountId: "a" });
    expect(
      validatePosting({ accountId: "a", units: 5000, priceNum: 1, priceDenom: 0, baseAmount: 5000 }),
    ).toContainEqual({ code: "PRICE_NOT_POSITIVE", accountId: "a" });
    expect(
      validatePosting({ accountId: "a", units: 5000, priceNum: -1, priceDenom: 1, baseAmount: 5000 }),
    ).toContainEqual({ code: "PRICE_NOT_POSITIVE", accountId: "a" });
    expect(
      validatePosting({ accountId: "a", units: 5000, priceNum: 1.5, priceDenom: 1, baseAmount: 5000 }),
    ).toContainEqual({ code: "PRICE_NOT_POSITIVE", accountId: "a" });
  });

  it("rejects zero or fractional baseAmount", () => {
    expect(
      validatePosting({ accountId: "a", units: 5000, priceNum: 1, priceDenom: 1, baseAmount: 0 }),
    ).toContainEqual({ code: "INVALID_BASE_AMOUNT", accountId: "a" });
    expect(
      validatePosting({ accountId: "a", units: 5000, priceNum: 1, priceDenom: 1, baseAmount: 50.5 }),
    ).toContainEqual({ code: "INVALID_BASE_AMOUNT", accountId: "a" });
  });
});
