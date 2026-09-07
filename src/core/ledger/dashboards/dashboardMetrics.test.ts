import { describe, expect, it } from "vitest";
import { average, currentMonthWindow, monthWindow, monthlyEquivalentAmount, percentDelta, trailingMonthWindows } from "./dashboardMetrics";

describe("monthWindow", () => {
  it("returns the inclusive start and exclusive end of a calendar month", () => {
    expect(monthWindow(2026, 8)).toEqual({ startIso: "2026-09-01", endIsoExclusive: "2026-10-01" });
  });

  it("rolls over into the next year for December", () => {
    expect(monthWindow(2026, 11)).toEqual({ startIso: "2026-12-01", endIsoExclusive: "2027-01-01" });
  });

  it("rolls back into the previous year when the month index is negative", () => {
    expect(monthWindow(2026, -1)).toEqual({ startIso: "2025-12-01", endIsoExclusive: "2026-01-01" });
  });
});

describe("currentMonthWindow", () => {
  it("uses the injected today's own month", () => {
    expect(currentMonthWindow(new Date("2026-09-06T12:00:00Z"))).toEqual({
      startIso: "2026-09-01",
      endIsoExclusive: "2026-10-01",
    });
  });
});

describe("trailingMonthWindows", () => {
  it("returns N windows ending at (and including) today's own month, oldest first", () => {
    const windows = trailingMonthWindows(3, new Date("2026-09-06T12:00:00Z"));
    expect(windows).toEqual([
      { startIso: "2026-07-01", endIsoExclusive: "2026-08-01" },
      { startIso: "2026-08-01", endIsoExclusive: "2026-09-01" },
      { startIso: "2026-09-01", endIsoExclusive: "2026-10-01" },
    ]);
  });
});

describe("average", () => {
  it("computes the arithmetic mean", () => {
    expect(average([100, 200, 300])).toBe(200);
  });

  it("returns 0 for an empty series", () => {
    expect(average([])).toBe(0);
  });
});

describe("percentDelta", () => {
  it("computes a signed percentage vs a baseline", () => {
    expect(percentDelta(120, 100)).toBe(20);
    expect(percentDelta(80, 100)).toBe(-20);
  });

  it("returns null when the baseline is 0, not Infinity", () => {
    expect(percentDelta(100, 0)).toBeNull();
  });
});

describe("monthlyEquivalentAmount", () => {
  it("returns the amount as-is for a plain MONTHLY rule", () => {
    expect(monthlyEquivalentAmount("MONTHLY", 1, 250000)).toBe(250000);
  });

  it("divides by interval for a every-N-months rule", () => {
    expect(monthlyEquivalentAmount("MONTHLY", 3, 300000)).toBe(100000);
  });

  it("divides a yearly amount by 12", () => {
    expect(monthlyEquivalentAmount("YEARLY", 1, 1200000)).toBe(100000);
  });

  it("scales a weekly amount up to a monthly equivalent", () => {
    expect(monthlyEquivalentAmount("WEEKLY", 1, 1000)).toBeCloseTo(4345, 0);
  });

  it("scales a daily amount up to a monthly equivalent", () => {
    expect(monthlyEquivalentAmount("DAILY", 1, 100)).toBeCloseTo(3044, 0);
  });
});
