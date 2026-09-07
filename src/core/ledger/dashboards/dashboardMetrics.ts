// Dashboard System Phase 1 delta (2026-09-06) — pure math shared by the
// new panels' metric functions (server/services/dashboardMetrics.ts),
// mirroring this codebase's existing Budget split (pure math in
// core/ledger/budgets/budget.ts, DB orchestration in
// server/services/budgets.ts). No DB/React here.

export interface MonthWindow {
  startIso: string; // inclusive, YYYY-MM-DD
  endIsoExclusive: string; // exclusive, YYYY-MM-DD
}

// UTC-anchored, same convention as this codebase's other date math
// (recurring.ts, budget.ts) — avoids local-timezone month-boundary drift.
export function monthWindow(year: number, monthIndexZeroBased: number): MonthWindow {
  const start = new Date(Date.UTC(year, monthIndexZeroBased, 1));
  const end = new Date(Date.UTC(year, monthIndexZeroBased + 1, 1));
  return { startIso: start.toISOString().slice(0, 10), endIsoExclusive: end.toISOString().slice(0, 10) };
}

export function currentMonthWindow(today: Date = new Date()): MonthWindow {
  return monthWindow(today.getUTCFullYear(), today.getUTCMonth());
}

// N trailing month windows ending at (and including) `today`'s own month,
// oldest first — the shape every rolling-average/trend panel needs.
export function trailingMonthWindows(monthCount: number, today: Date = new Date()): MonthWindow[] {
  const windows: MonthWindow[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    windows.push(monthWindow(today.getUTCFullYear(), today.getUTCMonth() - i));
  }
  return windows;
}

// Simple arithmetic mean — 0 for an empty series (no history yet is "no
// average," not a divide-by-zero crash).
export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// A signed percentage delta of `current` vs `baseline` — null when
// `baseline` is 0 (an undefined percentage, not a fabricated Infinity).
export function percentDelta(current: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

// Recurring Expenses panel — a monthly-equivalent estimate from a
// Recurring Rule's own frequency/interval/amount, not a real occurrence
// count over a concrete date range (`occurrencesInRange` needs a window,
// and picking a "typical month" has its own edge cases — e.g. a MONTHLY
// rule anchored on day 31 doesn't occur in February). Average-days-per-
// unit multipliers (30.44/mo, 4.345 weeks/mo) are a deliberate
// approximation — accurate enough for "roughly how much is committed per
// month," not a billing calculation.
const DAYS_PER_MONTH = 30.44;
const WEEKS_PER_MONTH = 4.345;

export function monthlyEquivalentAmount(frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY", interval: number, amountMinor: number): number {
  switch (frequency) {
    case "DAILY":
      return (amountMinor * DAYS_PER_MONTH) / interval;
    case "WEEKLY":
      return (amountMinor * WEEKS_PER_MONTH) / interval;
    case "MONTHLY":
      return amountMinor / interval;
    case "YEARLY":
      return amountMinor / interval / 12;
  }
}
