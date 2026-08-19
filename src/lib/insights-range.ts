import type { DateRange } from "@/server/use-cases/accountHistory";

// Insights tab's shared date-range control (product refresh: "the selected
// range applies to the entire Insights page rather than a separate date
// selector on every chart"). Preset-only — no "Custom" free-form range
// (that needs a real date-picker UI that doesn't exist yet; the other
// seven presets cover the common cases without it, and this list is easy
// to extend once a picker exists). "All time" is `undefined`/`undefined`
// (no filtering at all — `getBalanceTrend`/`getMonthlyCashflow`/
// `getAccountRangeSummary` already treat a missing `from`/`to` as
// unbounded).
export const INSIGHTS_RANGE_PRESETS = [
  "all-time",
  "this-year",
  "last-12-months",
  "last-6-months",
  "last-3-months",
  "this-month",
  "previous-month",
] as const;

export type InsightsRangePreset = (typeof INSIGHTS_RANGE_PRESETS)[number];

export const INSIGHTS_RANGE_LABELS: Record<InsightsRangePreset, string> = {
  "all-time": "All time",
  "this-year": "This year",
  "last-12-months": "Last 12 months",
  "last-6-months": "Last 6 months",
  "last-3-months": "Last 3 months",
  "this-month": "This month",
  "previous-month": "Previous month",
};

export const DEFAULT_INSIGHTS_RANGE: InsightsRangePreset = "last-12-months";

export function parseInsightsRangePreset(raw: string | undefined): InsightsRangePreset {
  if (raw && (INSIGHTS_RANGE_PRESETS as readonly string[]).includes(raw)) {
    return raw as InsightsRangePreset;
  }
  return DEFAULT_INSIGHTS_RANGE;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function firstOfMonth(date: Date, monthOffset: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1));
}

// `today` is injectable (tests only — real callers always use the default)
// so range boundaries are computed against a fixed, known date instead of
// the real wall clock.
export function resolveInsightsRange(preset: InsightsRangePreset, today: Date = new Date()): DateRange {
  const todayIso = toIsoDate(today);
  switch (preset) {
    case "all-time":
      return {};
    case "this-year":
      return { from: `${today.getUTCFullYear()}-01-01`, to: todayIso };
    case "last-12-months":
      return { from: toIsoDate(firstOfMonth(today, -11)), to: todayIso };
    case "last-6-months":
      return { from: toIsoDate(firstOfMonth(today, -5)), to: todayIso };
    case "last-3-months":
      return { from: toIsoDate(firstOfMonth(today, -2)), to: todayIso };
    case "this-month":
      return { from: toIsoDate(firstOfMonth(today, 0)), to: todayIso };
    case "previous-month": {
      const start = firstOfMonth(today, -1);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
  }
}
