import { describe, expect, it } from "vitest";
import {
  RationalOverflowError,
  decimalRateToMinorRational,
  decimalToRational,
  makeRational,
  minorRationalToDecimalRate,
  multiplyRationalByInt,
  roundHalfEvenToInt,
} from "./rational";

describe("makeRational", () => {
  it("GCD-reduces before storing", () => {
    expect(makeRational(3850000, 70000)).toEqual({ num: 55, denom: 1 });
    expect(makeRational(6, 4)).toEqual({ num: 3, denom: 2 });
  });

  it("leaves an already-reduced fraction unchanged", () => {
    expect(makeRational(1, 1)).toEqual({ num: 1, denom: 1 });
  });

  it("rejects non-positive or non-integer num/denom", () => {
    expect(() => makeRational(0, 1)).toThrow(RangeError);
    expect(() => makeRational(1, 0)).toThrow(RangeError);
    expect(() => makeRational(-1, 1)).toThrow(RangeError);
    expect(() => makeRational(1, -1)).toThrow(RangeError);
    expect(() => makeRational(1.5, 1)).toThrow(RangeError);
  });
});

describe("multiplyRationalByInt", () => {
  it("produces an exact unreduced BigInt fraction", () => {
    expect(multiplyRationalByInt(70000, { num: 55, denom: 1 })).toEqual({ num: BigInt(3850000), denom: BigInt(1) });
    expect(multiplyRationalByInt(-70000, { num: 55, denom: 1 })).toEqual({
      num: BigInt(-3850000),
      denom: BigInt(1),
    });
  });
});

describe("roundHalfEvenToInt", () => {
  it("rounds down/up on the non-tie side normally", () => {
    expect(roundHalfEvenToInt(BigInt(9), BigInt(4))).toBe(2); // 2.25 -> 2
    expect(roundHalfEvenToInt(BigInt(11), BigInt(4))).toBe(3); // 2.75 -> 3
  });

  it("breaks an exact .5 tie toward the even neighbor", () => {
    expect(roundHalfEvenToInt(BigInt(10), BigInt(4))).toBe(2); // 2.5 -> 2 (even)
    expect(roundHalfEvenToInt(BigInt(5), BigInt(2))).toBe(2); // 2.5 -> 2 (even)
    expect(roundHalfEvenToInt(BigInt(7), BigInt(2))).toBe(4); // 3.5 -> 4 (even)
  });

  it("handles negative numerators symmetrically", () => {
    expect(roundHalfEvenToInt(BigInt(-5), BigInt(2))).toBe(-2);
    expect(roundHalfEvenToInt(BigInt(-7), BigInt(2))).toBe(-4);
  });

  it("throws on a non-positive denominator", () => {
    expect(() => roundHalfEvenToInt(BigInt(1), BigInt(0))).toThrow(RangeError);
    expect(() => roundHalfEvenToInt(BigInt(1), BigInt(-1))).toThrow(RangeError);
  });

  it("throws RationalOverflowError beyond Number.MAX_SAFE_INTEGER", () => {
    const tooBig = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(10);
    expect(() => roundHalfEvenToInt(tooBig, BigInt(1))).toThrow(RationalOverflowError);
  });
});

describe("decimalToRational", () => {
  it("converts a decimal rate into an exact reduced fraction", () => {
    expect(decimalToRational(83.25, 2)).toEqual({ num: 333, denom: 4 });
  });

  it("rejects zero or negative input", () => {
    expect(() => decimalToRational(0)).toThrow(RangeError);
    expect(() => decimalToRational(-1)).toThrow(RangeError);
  });
});

describe("decimalRateToMinorRational / minorRationalToDecimalRate", () => {
  it("accounts for a lower-scale currency into a higher-scale Base Currency (JPY scale 0 -> INR scale 2)", () => {
    // "1 JPY = ₹0.58" -> 58 paise per 1 JPY minor unit (JPY has no minor
    // units of its own, scale 0) -> 58/1, matching the worked example in
    // the delta doc (3,850,000/70,000 -> 55/1 is the same shape).
    expect(decimalRateToMinorRational(0.58, 0, 2)).toEqual({ num: 58, denom: 1 });
  });

  it("is the identity shape when both currencies share the same scale (USD/INR, both 2)", () => {
    expect(decimalRateToMinorRational(83.25, 2, 2)).toEqual({ num: 333, denom: 4 });
  });

  it("accounts for a higher-scale currency into a lower-scale Base Currency", () => {
    // Base has scale 0, currency has scale 2 -> 1 minor unit of currency
    // (1 paise-equivalent) is worth 1/100 as much per whole unit.
    expect(decimalRateToMinorRational(100, 2, 0)).toEqual({ num: 1, denom: 1 });
  });

  it("round-trips through minorRationalToDecimalRate exactly", () => {
    const rational = decimalRateToMinorRational(0.58, 0, 2);
    expect(minorRationalToDecimalRate(rational, 0, 2)).toBeCloseTo(0.58, 10);

    const rational2 = decimalRateToMinorRational(83.25, 2, 2);
    expect(minorRationalToDecimalRate(rational2, 2, 2)).toBeCloseTo(83.25, 10);
  });
});
