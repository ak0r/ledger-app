import { describe, expect, it } from "vitest";
import {
  budgetPeriodWindowAt,
  currentOrNextBudgetPeriod,
  nextBudgetPeriodAfter,
  validateBudget,
  validateBudgetAllocation,
  validateBudgetScope,
  type BudgetInput,
  type BudgetRecurrenceSchedule,
  type ExpenseAccountRef,
} from "./budget";

const PROFILE = "profile-1";
const OTHER_PROFILE = "profile-2";

function expenseAccount(id: string, overrides: Partial<ExpenseAccountRef> = {}): ExpenseAccountRef {
  return { id, profileId: PROFILE, classification: "EXPENSE", ...overrides };
}

function baseInput(overrides: Partial<BudgetInput> = {}): BudgetInput {
  return { profileId: PROFILE, name: "Food Expenses", type: "ONE_TIME", ...overrides };
}

describe("validateBudget", () => {
  it("accepts a valid one-time budget", () => {
    expect(validateBudget(baseInput())).toEqual([]);
  });

  it("rejects an empty name", () => {
    expect(validateBudget(baseInput({ name: "  " }))).toContainEqual({ code: "NAME_REQUIRED" });
  });

  it("requires recurrence for a RECURRING budget", () => {
    expect(validateBudget(baseInput({ type: "RECURRING" }))).toContainEqual({ code: "RECURRENCE_REQUIRED" });
  });

  it("rejects recurrence on a ONE_TIME budget", () => {
    const recurrence: BudgetRecurrenceSchedule = { unit: "MONTH", interval: 1, startDate: "2026-09-01" };
    expect(validateBudget(baseInput({ recurrence }))).toContainEqual({ code: "RECURRENCE_NOT_ALLOWED" });
  });

  it("accepts a valid recurring budget", () => {
    const recurrence: BudgetRecurrenceSchedule = { unit: "MONTH", interval: 1, startDate: "2026-09-01" };
    expect(validateBudget(baseInput({ type: "RECURRING", recurrence }))).toEqual([]);
  });

  it("rejects an invalid interval", () => {
    const recurrence: BudgetRecurrenceSchedule = { unit: "MONTH", interval: 0, startDate: "2026-09-01" };
    expect(validateBudget(baseInput({ type: "RECURRING", recurrence }))).toContainEqual({ code: "INVALID_INTERVAL" });
  });

  it("rejects an end date before the start date", () => {
    const recurrence: BudgetRecurrenceSchedule = {
      unit: "MONTH",
      interval: 1,
      startDate: "2026-09-01",
      endDate: "2026-01-01",
    };
    expect(validateBudget(baseInput({ type: "RECURRING", recurrence }))).toContainEqual({ code: "END_BEFORE_START" });
  });

  it("rejects both endDate and occurrences set", () => {
    const recurrence: BudgetRecurrenceSchedule = {
      unit: "MONTH",
      interval: 1,
      startDate: "2026-09-01",
      endDate: "2027-09-01",
      occurrences: 6,
    };
    expect(validateBudget(baseInput({ type: "RECURRING", recurrence }))).toContainEqual({
      code: "AMBIGUOUS_END_CONDITION",
    });
  });

  it("rejects non-positive occurrences", () => {
    const recurrence: BudgetRecurrenceSchedule = {
      unit: "MONTH",
      interval: 1,
      startDate: "2026-09-01",
      occurrences: 0,
    };
    expect(validateBudget(baseInput({ type: "RECURRING", recurrence }))).toContainEqual({
      code: "INVALID_OCCURRENCES",
    });
  });
});

describe("budgetPeriodWindowAt", () => {
  it("DAILY-equivalent DAY windows are single days", () => {
    const schedule: BudgetRecurrenceSchedule = { unit: "DAY", interval: 1, startDate: "2026-09-01" };
    expect(budgetPeriodWindowAt(schedule, 0)).toEqual({ index: 0, startDate: "2026-09-01", endDate: "2026-09-01" });
    expect(budgetPeriodWindowAt(schedule, 1)).toEqual({ index: 1, startDate: "2026-09-02", endDate: "2026-09-02" });
  });

  it("WEEK windows span 7 days", () => {
    const schedule: BudgetRecurrenceSchedule = { unit: "WEEK", interval: 1, startDate: "2026-09-01" };
    expect(budgetPeriodWindowAt(schedule, 1)).toEqual({ index: 1, startDate: "2026-09-08", endDate: "2026-09-14" });
  });

  it("MONTH windows span the full calendar month", () => {
    const schedule: BudgetRecurrenceSchedule = { unit: "MONTH", interval: 1, startDate: "2026-09-01" };
    expect(budgetPeriodWindowAt(schedule, 1)).toEqual({ index: 1, startDate: "2026-10-01", endDate: "2026-10-31" });
  });

  it("MONTH clamps a day-31 anchor into shorter months", () => {
    const schedule: BudgetRecurrenceSchedule = { unit: "MONTH", interval: 1, startDate: "2026-01-31" };
    // period 1 anchors Feb 28 (clamped), so it must end the day before
    // period 2's anchor (Mar 31, clamp doesn't apply — March has 31 days).
    expect(budgetPeriodWindowAt(schedule, 1)).toEqual({ index: 1, startDate: "2026-02-28", endDate: "2026-03-30" });
  });

  it("YEAR windows span a full year", () => {
    const schedule: BudgetRecurrenceSchedule = { unit: "YEAR", interval: 1, startDate: "2026-01-01" };
    expect(budgetPeriodWindowAt(schedule, 1)).toEqual({ index: 1, startDate: "2027-01-01", endDate: "2027-12-31" });
  });
});

describe("currentOrNextBudgetPeriod", () => {
  const schedule: BudgetRecurrenceSchedule = { unit: "MONTH", interval: 1, startDate: "2026-09-01" };

  it("returns the first period when today is before the schedule starts", () => {
    expect(currentOrNextBudgetPeriod(schedule, "2026-08-01")).toEqual({
      index: 0,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("returns the period covering today", () => {
    expect(currentOrNextBudgetPeriod(schedule, "2026-10-15")).toEqual({
      index: 1,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
  });

  it("returns null once terminated by endDate", () => {
    const terminated: BudgetRecurrenceSchedule = { ...schedule, endDate: "2026-09-30" };
    expect(currentOrNextBudgetPeriod(terminated, "2026-11-01")).toBeNull();
  });

  it("returns null once terminated by occurrences", () => {
    const terminated: BudgetRecurrenceSchedule = { ...schedule, occurrences: 2 };
    expect(currentOrNextBudgetPeriod(terminated, "2026-11-15")).toBeNull();
  });
});

describe("nextBudgetPeriodAfter", () => {
  it("returns the following period", () => {
    const schedule: BudgetRecurrenceSchedule = { unit: "MONTH", interval: 1, startDate: "2026-09-01" };
    expect(nextBudgetPeriodAfter(schedule, 0)).toEqual({ index: 1, startDate: "2026-10-01", endDate: "2026-10-31" });
  });

  it("returns null once the next period would be terminated", () => {
    const schedule: BudgetRecurrenceSchedule = { unit: "MONTH", interval: 1, startDate: "2026-09-01", occurrences: 1 };
    expect(nextBudgetPeriodAfter(schedule, 0)).toBeNull();
  });
});

describe("validateBudgetScope", () => {
  const accounts = new Map(
    [
      expenseAccount("food"),
      expenseAccount("other-profile-food", { profileId: OTHER_PROFILE }),
      { id: "salary", profileId: PROFILE, classification: "INCOME" as const },
    ].map((a) => [a.id, a]),
  );

  it("accepts an owned expense account", () => {
    expect(validateBudgetScope(PROFILE, ["food"], accounts)).toEqual([]);
  });

  it("rejects an unknown account", () => {
    expect(validateBudgetScope(PROFILE, ["ghost"], accounts)).toContainEqual({
      code: "ACCOUNT_NOT_FOUND",
      accountId: "ghost",
    });
  });

  it("rejects an account owned by another profile", () => {
    expect(validateBudgetScope(PROFILE, ["other-profile-food"], accounts)).toContainEqual({
      code: "OWNERSHIP_MISMATCH",
      accountId: "other-profile-food",
    });
  });

  it("rejects a non-expense account", () => {
    expect(validateBudgetScope(PROFILE, ["salary"], accounts)).toContainEqual({
      code: "NOT_EXPENSE_ACCOUNT",
      accountId: "salary",
    });
  });
});

describe("validateBudgetAllocation", () => {
  const accounts = new Map([expenseAccount("food")].map((a) => [a.id, a]));

  it("accepts a positive target on an owned expense account", () => {
    expect(validateBudgetAllocation(PROFILE, { expenseAccountId: "food", targetAmountMinor: 1_500_000 }, accounts)).toEqual(
      [],
    );
  });

  it("rejects a zero target", () => {
    expect(
      validateBudgetAllocation(PROFILE, { expenseAccountId: "food", targetAmountMinor: 0 }, accounts),
    ).toContainEqual({ code: "INVALID_AMOUNT", expenseAccountId: "food" });
  });

  it("rejects an unknown account", () => {
    expect(
      validateBudgetAllocation(PROFILE, { expenseAccountId: "ghost", targetAmountMinor: 100 }, accounts),
    ).toContainEqual({ code: "ACCOUNT_NOT_FOUND", expenseAccountId: "ghost" });
  });
});
