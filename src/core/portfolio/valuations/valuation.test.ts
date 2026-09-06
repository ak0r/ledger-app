import { describe, expect, it } from "vitest";
import { toQuantityMinorUnits } from "../../shared/quantity";
import { currentValue } from "./valuation";

describe("currentValue", () => {
  it("multiplies units by the latest NAV at the currency's own scale", () => {
    expect(currentValue(toQuantityMinorUnits(100), 50, 2)).toBe(500000);
  });

  it("returns undefined when there is no known NAV", () => {
    expect(currentValue(toQuantityMinorUnits(100), undefined, 2)).toBeUndefined();
  });
});
