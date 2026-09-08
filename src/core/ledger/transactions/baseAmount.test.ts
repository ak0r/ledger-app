import { describe, expect, it } from "vitest";
import { computeBaseAmounts } from "./baseAmount";

const ONE_TO_ONE = { num: 1, denom: 1 };

describe("computeBaseAmounts", () => {
  it("same-currency legs (price 1/1) reduce to baseAmount === units for every leg", () => {
    const postings = [
      { units: 2000, price: ONE_TO_ONE }, // debit
      { units: -2000, price: ONE_TO_ONE }, // credit, primary
    ];
    expect(computeBaseAmounts(postings, 1)).toEqual([2000, -2000]);
  });

  it("a single foreign leg with an exact rate needs no rounding — residual is zero", () => {
    // ¥15,000 @ an exact rate that reconciles to ₹10,000 with no remainder.
    const postings = [
      { units: -1000000, price: ONE_TO_ONE }, // credit, INR, primary
      { units: 15000, price: { num: 1000000, denom: 15000 } }, // debit, JPY
    ];
    const result = computeBaseAmounts(postings, 0);
    expect(result[1]).toBe(1000000);
    expect(result[0]).toBe(-1000000);
    expect(result[0] + result[1]).toBe(0);
  });

  it("a rate that doesn't divide evenly rounds the non-primary leg half-even, and the primary leg absorbs the residual exactly", () => {
    // units=100 at price 1/3 -> exact value 33.333...; half-even rounds to 33.
    // The primary leg's own units/price are irrelevant to its own baseAmount
    // — it's always -(sum of the others), never independently computed.
    const postings = [
      { units: -1, price: ONE_TO_ONE }, // primary
      { units: 100, price: { num: 1, denom: 3 } },
    ];
    const result = computeBaseAmounts(postings, 0);
    expect(result[1]).toBe(33); // 100/3 = 33.33 -> half-even rounds to 33
    expect(result[0]).toBe(-33); // primary absorbs the exact residual, not its own naive value
    expect(result[0] + result[1]).toBe(0);
  });

  it("genuine N-leg: one primary, several independently-priced non-primary legs, always sums to zero", () => {
    const postings = [
      { units: -100000, price: ONE_TO_ONE }, // primary (From, base currency)
      { units: 500, price: { num: 100, denom: 3 } }, // 500 * 100/3 = 16666.67 -> 16667
      { units: 200, price: { num: 250, denom: 7 } }, // 200 * 250/7 = 7142.857 -> 7143
    ];
    const result = computeBaseAmounts(postings, 0);
    expect(result[1]).toBe(16667);
    expect(result[2]).toBe(7143);
    expect(result[0]).toBe(-(result[1] + result[2]));
    expect(result[0] + result[1] + result[2]).toBe(0);
  });

  it("throws when primaryIndex is out of range", () => {
    expect(() => computeBaseAmounts([{ units: 1, price: ONE_TO_ONE }], 5)).toThrow(RangeError);
    expect(() => computeBaseAmounts([{ units: 1, price: ONE_TO_ONE }], -1)).toThrow(RangeError);
  });
});
