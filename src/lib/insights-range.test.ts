import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSIGHTS_RANGE,
  parseInsightsRangePreset,
  resolveInsightsRange,
} from "./insights-range";

const TODAY = new Date("2026-08-19T12:00:00Z");

describe("parseInsightsRangePreset", () => {
  it("falls back to the default for missing/unknown values", () => {
    expect(parseInsightsRangePreset(undefined)).toBe(DEFAULT_INSIGHTS_RANGE);
    expect(parseInsightsRangePreset("bogus")).toBe(DEFAULT_INSIGHTS_RANGE);
  });

  it("accepts a valid preset", () => {
    expect(parseInsightsRangePreset("all-time")).toBe("all-time");
  });
});

describe("resolveInsightsRange", () => {
  it("all-time is fully unbounded", () => {
    expect(resolveInsightsRange("all-time", TODAY)).toEqual({});
  });

  it("this-year runs from Jan 1 to today", () => {
    expect(resolveInsightsRange("this-year", TODAY)).toEqual({ from: "2026-01-01", to: "2026-08-19" });
  });

  it("last-12-months includes the current month as one of the 12", () => {
    // Aug 2026 back 11 months = Sep 2025.
    expect(resolveInsightsRange("last-12-months", TODAY)).toEqual({ from: "2025-09-01", to: "2026-08-19" });
  });

  it("last-6-months / last-3-months", () => {
    expect(resolveInsightsRange("last-6-months", TODAY)).toEqual({ from: "2026-03-01", to: "2026-08-19" });
    expect(resolveInsightsRange("last-3-months", TODAY)).toEqual({ from: "2026-06-01", to: "2026-08-19" });
  });

  it("this-month runs from the 1st to today", () => {
    expect(resolveInsightsRange("this-month", TODAY)).toEqual({ from: "2026-08-01", to: "2026-08-19" });
  });

  it("previous-month is the full prior calendar month", () => {
    expect(resolveInsightsRange("previous-month", TODAY)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("previous-month handles a January 'today' by rolling back to December of the prior year", () => {
    const jan = new Date("2026-01-15T00:00:00Z");
    expect(resolveInsightsRange("previous-month", jan)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});
