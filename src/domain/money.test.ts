import { describe, expect, it } from "vitest";
import { fromMinorUnits, isNonNegativeInteger, sum, toMinorUnits } from "./money";

describe("isNonNegativeInteger", () => {
  it("accepts zero and positive integers", () => {
    expect(isNonNegativeInteger(0)).toBe(true);
    expect(isNonNegativeInteger(5000)).toBe(true);
  });

  it("rejects negative and fractional values", () => {
    expect(isNonNegativeInteger(-1)).toBe(false);
    expect(isNonNegativeInteger(50.5)).toBe(false);
  });
});

describe("sum", () => {
  it("sums a list of amounts", () => {
    expect(sum([2000, 3000])).toBe(5000);
    expect(sum([])).toBe(0);
  });
});

describe("toMinorUnits / fromMinorUnits", () => {
  it("round-trips a decimal amount through the INR scale (2)", () => {
    expect(toMinorUnits(50.25, 2)).toBe(5025);
    expect(fromMinorUnits(5025, 2)).toBe(50.25);
  });

  it("rounds to the nearest minor unit", () => {
    expect(toMinorUnits(50.005, 2)).toBe(5001);
  });
});
