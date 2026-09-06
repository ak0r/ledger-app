import { describe, expect, it } from "vitest";
import { QUANTITY_SCALE, fromQuantityMinorUnits, toQuantityMinorUnits } from "./quantity";

describe("toQuantityMinorUnits / fromQuantityMinorUnits", () => {
  it("round-trips a fractional mutual fund unit count at the fixed 6-decimal scale", () => {
    expect(toQuantityMinorUnits(72.4567)).toBe(72456700);
    expect(fromQuantityMinorUnits(72456700)).toBe(72.4567);
  });

  it("round-trips a whole share count", () => {
    expect(toQuantityMinorUnits(100)).toBe(100000000);
    expect(fromQuantityMinorUnits(100000000)).toBe(100);
  });

  it("rounds to the nearest quantity minor unit", () => {
    expect(toQuantityMinorUnits(0.0000005)).toBe(1);
  });

  it("QUANTITY_SCALE is 6", () => {
    expect(QUANTITY_SCALE).toBe(6);
  });
});
