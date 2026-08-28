import type { AccountRef } from "./transaction";
import { isNonNegativeInteger } from "./money";

// Recurring Transactions Phase 1 (docs/pending/2026-08-27-Recurring-Transactions.md).
// Structured schedule columns, not a stored RRULE string (explicit call:
// an opaque RRULE blob would need a parser/serializer dependency just to
// read a schedule back for the Rules table/form — these four frequencies
// with a single interval/day are cheap to model directly). `nextOccurrence`
// still follows RRULE-shaped semantics (BYMONTHDAY/BYWEEKDAY are the
// recurrence anchor, independent of `startDate`'s own day-of-month/week),
// it just isn't RFC5545 syntax.
export const RECURRING_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export interface RecurringSchedule {
  frequency: RecurringFrequency;
  interval: number;
  // Required for MONTHLY/YEARLY, ignored otherwise. 1-31; clamped to the
  // target month's actual length (ponytail: RFC5545 skips invalid months
  // entirely instead of clamping — Phase 1 takes the simpler, friendlier
  // behaviour; revisit if a real schedule needs strict RFC semantics).
  byMonthDay?: number | null;
  // Required for WEEKLY, ignored otherwise. 0 (Sunday) - 6 (Saturday).
  byWeekday?: number | null;
  startDate: string; // ISO date, YYYY-MM-DD
  endDate?: string | null; // null/undefined = Never
}

export interface RecurringTemplate {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  description: string;
}

export interface RecurringRuleInput {
  profileId: string;
  name: string;
  template: RecurringTemplate;
  schedule: RecurringSchedule;
}

export type RecurringRuleViolation =
  | { code: "NAME_REQUIRED" }
  | { code: "SAME_ACCOUNT" }
  | { code: "ACCOUNT_NOT_FOUND"; accountId: string }
  | { code: "OWNERSHIP_MISMATCH"; accountId: string }
  | { code: "INVALID_AMOUNT" }
  | { code: "DESCRIPTION_REQUIRED" }
  | { code: "INVALID_INTERVAL" }
  | { code: "BY_MONTH_DAY_REQUIRED" }
  | { code: "BY_MONTH_DAY_OUT_OF_RANGE" }
  | { code: "BY_WEEKDAY_REQUIRED" }
  | { code: "BY_WEEKDAY_OUT_OF_RANGE" }
  | { code: "INVALID_START_DATE" }
  | { code: "END_BEFORE_START" };

// Pure — mirrors validateTransaction's shape (domain/transaction.ts):
// callers look up Accounts and pass them in, this never touches a database.
export function validateRecurringRule(
  input: RecurringRuleInput,
  accounts: ReadonlyMap<string, AccountRef>,
): RecurringRuleViolation[] {
  const violations: RecurringRuleViolation[] = [];
  const { template, schedule } = input;

  if (input.name.trim().length === 0) violations.push({ code: "NAME_REQUIRED" });
  if (template.description.trim().length === 0) violations.push({ code: "DESCRIPTION_REQUIRED" });
  if (!isNonNegativeInteger(template.amountMinor) || template.amountMinor === 0) {
    violations.push({ code: "INVALID_AMOUNT" });
  }

  if (template.fromAccountId === template.toAccountId) {
    violations.push({ code: "SAME_ACCOUNT" });
  }
  for (const accountId of [template.fromAccountId, template.toAccountId]) {
    const account = accounts.get(accountId);
    if (!account) {
      violations.push({ code: "ACCOUNT_NOT_FOUND", accountId });
    } else if (account.profileId !== input.profileId) {
      violations.push({ code: "OWNERSHIP_MISMATCH", accountId });
    }
  }

  if (!Number.isInteger(schedule.interval) || schedule.interval < 1) {
    violations.push({ code: "INVALID_INTERVAL" });
  }
  if (schedule.frequency === "MONTHLY" || schedule.frequency === "YEARLY") {
    if (schedule.byMonthDay == null) violations.push({ code: "BY_MONTH_DAY_REQUIRED" });
    else if (schedule.byMonthDay < 1 || schedule.byMonthDay > 31) {
      violations.push({ code: "BY_MONTH_DAY_OUT_OF_RANGE" });
    }
  }
  if (schedule.frequency === "WEEKLY") {
    if (schedule.byWeekday == null) violations.push({ code: "BY_WEEKDAY_REQUIRED" });
    else if (schedule.byWeekday < 0 || schedule.byWeekday > 6) {
      violations.push({ code: "BY_WEEKDAY_OUT_OF_RANGE" });
    }
  }
  if (!isValidIsoDate(schedule.startDate)) violations.push({ code: "INVALID_START_DATE" });
  if (schedule.endDate && isValidIsoDate(schedule.startDate) && schedule.endDate < schedule.startDate) {
    violations.push({ code: "END_BEFORE_START" });
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

// n-th occurrence (0-based) counting from the schedule's own anchor.
function occurrenceAt(schedule: RecurringSchedule, n: number): Date {
  const start = toUtcDate(schedule.startDate);
  const interval = schedule.interval;
  switch (schedule.frequency) {
    case "DAILY":
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + n * interval));
    case "WEEKLY": {
      const anchorOffset = (7 + (schedule.byWeekday as number) - start.getUTCDay()) % 7;
      const anchor = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + anchorOffset),
      );
      return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + n * interval * 7));
    }
    case "MONTHLY": {
      const totalMonth = start.getUTCFullYear() * 12 + start.getUTCMonth() + n * interval;
      const year = Math.floor(totalMonth / 12);
      const month = totalMonth % 12;
      const day = Math.min(schedule.byMonthDay as number, daysInMonth(year, month));
      return new Date(Date.UTC(year, month, day));
    }
    case "YEARLY": {
      const year = start.getUTCFullYear() + n * interval;
      const day = Math.min(start.getUTCDate(), daysInMonth(year, start.getUTCMonth()));
      return new Date(Date.UTC(year, start.getUTCMonth(), day));
    }
  }
}

// ponytail: forward scan rather than closed-form month/year math — Phase 1
// only ever asks "next occurrence from ~today", so this is a handful of
// iterations in practice. Cap guards against a pathological interval/date
// combination looping unboundedly; upgrade to closed-form if a caller ever
// needs occurrences far in the future.
const MAX_OCCURRENCE_SCAN = 10_000;

// First occurrence on or after `onOrAfter`, or null if the schedule has
// already ended (or the scan cap is hit) before reaching it.
export function nextOccurrence(schedule: RecurringSchedule, onOrAfter: Date): string | null {
  // occurrenceAt(0) is just "the anchor within the start month/year" for
  // MONTHLY/YEARLY — it can land before startDate itself (e.g. start
  // 2026-08-15 with byMonthDay 7 anchors at 2026-08-07). Never surface an
  // occurrence earlier than the rule's own start.
  const floorIso = maxIso(toIsoDate(onOrAfter), schedule.startDate);
  const endIso = schedule.endDate ?? null;
  for (let n = 0; n < MAX_OCCURRENCE_SCAN; n++) {
    const iso = toIsoDate(occurrenceAt(schedule, n));
    if (endIso && iso > endIso) return null;
    if (iso >= floorIso) return iso;
  }
  return null;
}

// All occurrences within [rangeStartIso, rangeEndIso] inclusive — feeds the
// Calendar tab's month view.
export function occurrencesInRange(schedule: RecurringSchedule, rangeStartIso: string, rangeEndIso: string): string[] {
  const occurrences: string[] = [];
  const endIso = schedule.endDate ?? null;
  const floorIso = maxIso(rangeStartIso, schedule.startDate);
  for (let n = 0; n < MAX_OCCURRENCE_SCAN; n++) {
    const iso = toIsoDate(occurrenceAt(schedule, n));
    if (endIso && iso > endIso) break;
    if (iso > rangeEndIso) break;
    if (iso >= floorIso) occurrences.push(iso);
  }
  return occurrences;
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}
