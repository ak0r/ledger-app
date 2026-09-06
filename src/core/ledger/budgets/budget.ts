import type { Classification } from "../../shared/accountTypes";
import { isNonNegativeInteger } from "../../shared/money";

// Budget Framework delta (docs/completed/2026-09-01-Budget-Framework.md).
// A Budget is a definition + recurrence, same posture as a Recurring Rule
// (domain/recurring.ts) — it never posts to the Ledger and actuals are
// never persisted (spec §9). Unlike a Recurring Rule, a Budget Period is a
// *window* (start/end), not a single occurrence date, so the forward-scan
// machinery below returns windows, not points.
export const BUDGET_TYPES = ["ONE_TIME", "RECURRING"] as const;
export type BudgetType = (typeof BUDGET_TYPES)[number];

export const BUDGET_RECURRENCE_UNITS = ["DAY", "WEEK", "MONTH", "YEAR"] as const;
export type BudgetRecurrenceUnit = (typeof BUDGET_RECURRENCE_UNITS)[number];

export interface BudgetRecurrenceSchedule {
  unit: BudgetRecurrenceUnit;
  interval: number;
  startDate: string; // ISO date, YYYY-MM-DD
  endDate?: string | null;
  occurrences?: number | null;
}

// Budget filter shape (spec §6.2/§7) — condition-based scope, deliberately
// kept Budget-domain specific rather than reusing Transaction List's
// TransactionFilterState (spec §7's explicit call: "remain Budget-domain
// specific rather than directly coupling persistence to arbitrary
// Transaction List filter internals"). Only the shape lives here — pure,
// no repository types — so schema.ts can pin the persisted JSON columns'
// TS type the same way it already does for RecurringSchedule fields.
// Evaluation against ledger data lives in src/lib/budget-filter.ts, which
// needs AccountRow/TransactionWithPostings this layer must not depend on.
export const BUDGET_FILTER_FIELDS = ["expenseAccount", "date", "tags", "description"] as const;
export type BudgetFilterField = (typeof BUDGET_FILTER_FIELDS)[number];

export type BudgetExpenseAccountOperator = "is" | "is-not";
export type BudgetDateOperator = "before" | "after" | "between";
export type BudgetTagsOperator = "contains" | "not-contains";
export type BudgetDescriptionOperator = "contains" | "is" | "is-not";

export type BudgetFilterOperator =
  | BudgetExpenseAccountOperator
  | BudgetDateOperator
  | BudgetTagsOperator
  | BudgetDescriptionOperator;

export interface BudgetFilterCondition {
  id: string;
  field: BudgetFilterField;
  operator: BudgetFilterOperator;
  // string for expenseAccount/description/date before-after; [string, string]
  // for date "between".
  value?: string | [string, string];
}

export const BUDGET_FILTER_MATCHES = ["ALL", "ANY", "NONE"] as const;
export type BudgetFilterMatch = (typeof BUDGET_FILTER_MATCHES)[number];

export interface BudgetFilterState {
  match: BudgetFilterMatch;
  conditions: BudgetFilterCondition[];
}

export const EMPTY_BUDGET_FILTER_STATE: BudgetFilterState = { match: "ALL", conditions: [] };

// The live/current scope kept on `budgets`, and the frozen copy of it each
// BudgetPeriod stores as its own `scopeSnapshot` at approval time (spec
// §11.1 — later Budget edits must not rewrite a historical Period's copy).
export interface BudgetScopeSnapshot {
  explicitAccountIds: string[];
  filter: BudgetFilterState;
}

export interface BudgetInput {
  profileId: string;
  name: string;
  type: BudgetType;
  recurrence?: BudgetRecurrenceSchedule | null;
}

export type BudgetViolation =
  | { code: "NAME_REQUIRED" }
  | { code: "RECURRENCE_REQUIRED" }
  | { code: "RECURRENCE_NOT_ALLOWED" }
  | { code: "INVALID_INTERVAL" }
  | { code: "INVALID_START_DATE" }
  | { code: "END_BEFORE_START" }
  | { code: "INVALID_OCCURRENCES" }
  | { code: "AMBIGUOUS_END_CONDITION" };

// Pure — mirrors validateRecurringRule's shape (domain/recurring.ts):
// callers look up Accounts and pass them to validateBudgetScope/
// validateBudgetAllocation separately, this never touches a database.
export function validateBudget(input: BudgetInput): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  if (input.name.trim().length === 0) violations.push({ code: "NAME_REQUIRED" });

  if (input.type === "RECURRING") {
    if (!input.recurrence) {
      violations.push({ code: "RECURRENCE_REQUIRED" });
    } else {
      violations.push(...validateBudgetRecurrence(input.recurrence));
    }
  } else if (input.recurrence) {
    violations.push({ code: "RECURRENCE_NOT_ALLOWED" });
  }

  return violations;
}

function validateBudgetRecurrence(schedule: BudgetRecurrenceSchedule): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  if (!Number.isInteger(schedule.interval) || schedule.interval < 1) {
    violations.push({ code: "INVALID_INTERVAL" });
  }
  if (!isValidIsoDate(schedule.startDate)) violations.push({ code: "INVALID_START_DATE" });
  if (schedule.endDate && isValidIsoDate(schedule.startDate) && schedule.endDate < schedule.startDate) {
    violations.push({ code: "END_BEFORE_START" });
  }
  if (schedule.occurrences != null && (!Number.isInteger(schedule.occurrences) || schedule.occurrences < 1)) {
    violations.push({ code: "INVALID_OCCURRENCES" });
  }
  // UI presents end condition as a Never/On Date/After X Occurrences radio
  // (spec §15.2) — the two are mutually exclusive by construction there;
  // reject both set to keep period-window computation unambiguous.
  if (schedule.endDate && schedule.occurrences != null) {
    violations.push({ code: "AMBIGUOUS_END_CONDITION" });
  }
  return violations;
}

function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(toUtcDate(iso).getTime());
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// Advance `startDate` by `n` recurrence units (n may be 0). MONTH/YEAR
// clamp the day-of-month to the target month's actual length — same
// friendlier-than-RFC5545 posture as domain/recurring.ts's MONTHLY case
// (31 Jan + 1 month -> 28/29 Feb, not "skip February entirely").
function advance(startIso: string, n: number, unit: BudgetRecurrenceUnit): Date {
  const start = toUtcDate(startIso);
  switch (unit) {
    case "DAY":
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + n));
    case "WEEK":
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + n * 7));
    case "MONTH": {
      const totalMonth = start.getUTCFullYear() * 12 + start.getUTCMonth() + n;
      const year = Math.floor(totalMonth / 12);
      const month = totalMonth % 12;
      const day = Math.min(start.getUTCDate(), daysInMonth(year, month));
      return new Date(Date.UTC(year, month, day));
    }
    case "YEAR": {
      const year = start.getUTCFullYear() + n;
      const day = Math.min(start.getUTCDate(), daysInMonth(year, start.getUTCMonth()));
      return new Date(Date.UTC(year, start.getUTCMonth(), day));
    }
  }
}

export interface BudgetPeriodWindow {
  index: number;
  startDate: string;
  endDate: string;
}

// The n-th (0-based) period window: [start, day-before-next-start].
// Exported mainly for tests — callers normally want
// currentOrNextBudgetPeriod/nextBudgetPeriodAfter below.
export function budgetPeriodWindowAt(schedule: BudgetRecurrenceSchedule, n: number): BudgetPeriodWindow {
  const start = advance(schedule.startDate, n * schedule.interval, schedule.unit);
  const nextStart = advance(schedule.startDate, (n + 1) * schedule.interval, schedule.unit);
  const end = new Date(nextStart);
  end.setUTCDate(end.getUTCDate() - 1);
  return { index: n, startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function isTerminated(schedule: BudgetRecurrenceSchedule, window: BudgetPeriodWindow): boolean {
  if (schedule.endDate && window.startDate > schedule.endDate) return true;
  if (schedule.occurrences != null && window.index >= schedule.occurrences) return true;
  return false;
}

// ponytail: forward scan, same cap/rationale as domain/recurring.ts's
// nextOccurrence — Phase 1 only ever asks "current/next period around
// today," never "the 500th period," so this is a handful of iterations in
// practice. Cap guards a pathological interval/date combination.
const MAX_PERIOD_SCAN = 10_000;

// The period covering `todayIso` — or, if the schedule hasn't started yet,
// the first period (spec §5's "Next Period" review surfaces this before
// it's ever approved). Null once the schedule has terminated before
// reaching a period that would cover today.
export function currentOrNextBudgetPeriod(
  schedule: BudgetRecurrenceSchedule,
  todayIso: string,
): BudgetPeriodWindow | null {
  for (let n = 0; n < MAX_PERIOD_SCAN; n++) {
    const window = budgetPeriodWindowAt(schedule, n);
    if (isTerminated(schedule, window)) return null;
    if (todayIso <= window.endDate) return window;
  }
  return null;
}

// The period immediately after `afterIndex` — spec §5/§16's review flow,
// called once the current period is ending soon. Null once terminated.
export function nextBudgetPeriodAfter(
  schedule: BudgetRecurrenceSchedule,
  afterIndex: number,
): BudgetPeriodWindow | null {
  const window = budgetPeriodWindowAt(schedule, afterIndex + 1);
  return isTerminated(schedule, window) ? null : window;
}

// --- Scope / allocation validation -----------------------------------

// Deliberately not AccountRef (domain/transaction.ts) — that carries
// currencyCode, which scope/allocation validation never needs.
export interface ExpenseAccountRef {
  id: string;
  profileId: string;
  classification: Classification;
}

export type BudgetScopeViolation =
  | { code: "ACCOUNT_NOT_FOUND"; accountId: string }
  | { code: "OWNERSHIP_MISMATCH"; accountId: string }
  | { code: "NOT_EXPENSE_ACCOUNT"; accountId: string };

// Explicit accounts are expense-only (spec §14, AGENTS.md's expense-only
// boundary) and must belong to the same Profile (rule #5/#6) — same
// posture as validateRecurringRule's account ownership checks.
export function validateBudgetScope(
  profileId: string,
  explicitAccountIds: readonly string[],
  accounts: ReadonlyMap<string, ExpenseAccountRef>,
): BudgetScopeViolation[] {
  const violations: BudgetScopeViolation[] = [];
  for (const accountId of explicitAccountIds) {
    const account = accounts.get(accountId);
    if (!account) {
      violations.push({ code: "ACCOUNT_NOT_FOUND", accountId });
    } else if (account.profileId !== profileId) {
      violations.push({ code: "OWNERSHIP_MISMATCH", accountId });
    } else if (account.classification !== "EXPENSE") {
      violations.push({ code: "NOT_EXPENSE_ACCOUNT", accountId });
    }
  }
  return violations;
}

export interface BudgetAllocationInput {
  expenseAccountId: string;
  targetAmountMinor: number;
}

export type BudgetAllocationViolation =
  | { code: "INVALID_AMOUNT"; expenseAccountId: string }
  | { code: "ACCOUNT_NOT_FOUND"; expenseAccountId: string }
  | { code: "OWNERSHIP_MISMATCH"; expenseAccountId: string }
  | { code: "NOT_EXPENSE_ACCOUNT"; expenseAccountId: string };

// A target amount of 0 isn't meaningful (spec §8.2 — "no target configured"
// is represented by the allocation row's absence, never a zero-target row).
export function validateBudgetAllocation(
  profileId: string,
  input: BudgetAllocationInput,
  accounts: ReadonlyMap<string, ExpenseAccountRef>,
): BudgetAllocationViolation[] {
  const violations: BudgetAllocationViolation[] = [];
  if (!isNonNegativeInteger(input.targetAmountMinor) || input.targetAmountMinor === 0) {
    violations.push({ code: "INVALID_AMOUNT", expenseAccountId: input.expenseAccountId });
  }
  const account = accounts.get(input.expenseAccountId);
  if (!account) {
    violations.push({ code: "ACCOUNT_NOT_FOUND", expenseAccountId: input.expenseAccountId });
  } else if (account.profileId !== profileId) {
    violations.push({ code: "OWNERSHIP_MISMATCH", expenseAccountId: input.expenseAccountId });
  } else if (account.classification !== "EXPENSE") {
    violations.push({ code: "NOT_EXPENSE_ACCOUNT", expenseAccountId: input.expenseAccountId });
  }
  return violations;
}
