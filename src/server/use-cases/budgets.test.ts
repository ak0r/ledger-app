import { describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import { createTransaction } from "./transactions";
import {
  approveBudgetPeriod,
  calculateBudgetActuals,
  createBudget,
  deleteBudget,
  editBudget,
  getBudget,
  listBudgetsWithSummary,
  previewNextBudgetPeriod,
} from "./budgets";
import { BudgetAllocationValidationError, BudgetScopeValidationError, BudgetValidationError, NotFoundError } from "./errors";

function setUp(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const otherProfile = createProfile(db, { name: "Other" });
  const currency = createCurrency(db, { profileId: profile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
  const bank = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", instrumentType: "BANK" });
  const food = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Food", classification: "EXPENSE", instrumentType: "EXPENSE" });
  const travel = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Travel", classification: "EXPENSE", instrumentType: "EXPENSE" });
  const salary = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Salary", classification: "INCOME", instrumentType: "INCOME" });
  return { profile, otherProfile, bank, food, travel, salary };
}

describe("createBudget", () => {
  it("persists a one-time budget with its first period and allocations", () => {
    const db = createTestDb();
    const { profile, food, travel } = setUp(db);

    const { budget, period, allocations } = createBudget(db, {
      profileId: profile.id,
      name: "Japan 2026",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [food.id, travel.id], filter: { match: "ALL", conditions: [] } },
      allocations: [
        { expenseAccountId: food.id, targetAmountMinor: 40_000_00 },
        { expenseAccountId: travel.id, targetAmountMinor: 90_000_00 },
      ],
    });

    expect(budget.name).toBe("Japan 2026");
    expect(period.startDate).toBeNull();
    expect(period.endDate).toBeNull();
    expect(allocations).toHaveLength(2);
  });

  it("computes the first period's window for a recurring budget", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);

    const { period } = createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "RECURRING",
      recurrence: { unit: "MONTH", interval: 1, startDate: "2026-09-01" },
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
      allocations: [{ expenseAccountId: food.id, targetAmountMinor: 15_000_00 }],
    });

    expect(period.startDate).toBe("2026-09-01");
    expect(period.endDate).toBe("2026-09-30");
  });

  it("rejects an empty name", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    expect(() =>
      createBudget(db, { profileId: profile.id, name: "  ", type: "ONE_TIME", scope: { explicitAccountIds: [], filter: { match: "ALL", conditions: [] } } }),
    ).toThrow(BudgetValidationError);
  });

  it("rejects a non-expense explicit account", () => {
    const db = createTestDb();
    const { profile, salary } = setUp(db);
    expect(() =>
      createBudget(db, {
        profileId: profile.id,
        name: "Bad Scope",
        type: "ONE_TIME",
        scope: { explicitAccountIds: [salary.id], filter: { match: "ALL", conditions: [] } },
      }),
    ).toThrow(BudgetScopeValidationError);
  });

  it("rejects an allocation on an account owned by another profile", () => {
    const db = createTestDb();
    const { profile, otherProfile } = setUp(db);
    const otherCurrency = createCurrency(db, { profileId: otherProfile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
    const otherFood = createAccount(db, { profileId: otherProfile.id, currencyId: otherCurrency.id, name: "Food", classification: "EXPENSE", instrumentType: "EXPENSE" });

    expect(() =>
      createBudget(db, {
        profileId: profile.id,
        name: "Cross Profile",
        type: "ONE_TIME",
        scope: { explicitAccountIds: [], filter: { match: "ALL", conditions: [] } },
        allocations: [{ expenseAccountId: otherFood.id, targetAmountMinor: 1000 }],
      }),
    ).toThrow(BudgetAllocationValidationError);
  });
});

describe("editBudget", () => {
  it("updates the budget and syncs the current period's scope/allocations in place", () => {
    const db = createTestDb();
    const { profile, food, travel } = setUp(db);
    const { budget, period } = createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
      allocations: [{ expenseAccountId: food.id, targetAmountMinor: 15_000_00 }],
    });

    const edited = editBudget(db, {
      budgetId: budget.id,
      profileId: profile.id,
      name: "Food & Travel",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [food.id, travel.id], filter: { match: "ALL", conditions: [] } },
      allocations: [
        { expenseAccountId: food.id, targetAmountMinor: 15_000_00 },
        { expenseAccountId: travel.id, targetAmountMinor: 5_000_00 },
      ],
    });

    expect(edited.name).toBe("Food & Travel");
    expect(edited.explicitAccountIds).toEqual([food.id, travel.id]);

    // The edit updated the existing period's allocations in place — same
    // period id, new target for the newly-added Travel account.
    const actuals = calculateBudgetActuals(db, period.id, profile.id);
    expect(actuals.totalTargetMinor).toBe(20_000_00);
  });

  it("throws NotFoundError for a budget outside the profile", () => {
    const db = createTestDb();
    const { profile, otherProfile, food } = setUp(db);
    const { budget } = createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
    });

    expect(() =>
      editBudget(db, {
        budgetId: budget.id,
        profileId: otherProfile.id,
        name: "Hijacked",
        type: "ONE_TIME",
        scope: { explicitAccountIds: [], filter: { match: "ALL", conditions: [] } },
        allocations: [],
      }),
    ).toThrow(NotFoundError);
  });
});

describe("deleteBudget", () => {
  it("removes the budget and its periods/allocations", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    const { budget } = createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
      allocations: [{ expenseAccountId: food.id, targetAmountMinor: 15_000_00 }],
    });

    deleteBudget(db, { budgetId: budget.id, profileId: profile.id });

    expect(getBudget(db, budget.id, profile.id)).toBeUndefined();
  });
});

describe("previewNextBudgetPeriod / approveBudgetPeriod", () => {
  it("previews the next period defaulted from the latest one, then approves it", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    const { budget } = createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "RECURRING",
      recurrence: { unit: "MONTH", interval: 1, startDate: "2026-09-01" },
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
      allocations: [{ expenseAccountId: food.id, targetAmountMinor: 15_000_00 }],
    });

    const preview = previewNextBudgetPeriod(db, budget.id, profile.id);
    expect(preview?.window).toEqual({ index: 1, startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(preview?.defaults.allocations).toEqual([{ expenseAccountId: food.id, targetAmountMinor: 15_000_00 }]);

    const approved = approveBudgetPeriod(db, {
      budgetId: budget.id,
      profileId: profile.id,
      startDate: preview!.window.startDate,
      endDate: preview!.window.endDate,
      scope: preview!.defaults.scope,
      allocations: [{ expenseAccountId: food.id, targetAmountMinor: 16_000_00 }],
    });

    expect(approved.startDate).toBe("2026-10-01");
    expect(getBudget(db, budget.id, profile.id)?.filterMatch).toBe("ALL");

    // Approving again now previews period 2, not period 1 again.
    const nextPreview = previewNextBudgetPeriod(db, budget.id, profile.id);
    expect(nextPreview?.window.index).toBe(2);
  });

  it("returns null for a one-time budget", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    const { budget } = createBudget(db, {
      profileId: profile.id,
      name: "Japan 2026",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
    });

    expect(previewNextBudgetPeriod(db, budget.id, profile.id)).toBeNull();
  });
});

describe("calculateBudgetActuals", () => {
  it("sums explicit-account postings within the period's date range", () => {
    const db = createTestDb();
    const { profile, bank, food, travel } = setUp(db);
    const { budget, period } = createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "RECURRING",
      recurrence: { unit: "MONTH", interval: 1, startDate: "2026-09-01" },
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
      allocations: [{ expenseAccountId: food.id, targetAmountMinor: 15_000_00 }],
    });
    void budget;

    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "Groceries", postings: [{ accountId: bank.id, debit: 0, credit: 5000 }, { accountId: food.id, debit: 5000, credit: 0 }] });
    // Outside the period's date range — must not count.
    createTransaction(db, { profileId: profile.id, date: "2026-10-05", description: "Groceries next month", postings: [{ accountId: bank.id, debit: 0, credit: 5000 }, { accountId: food.id, debit: 5000, credit: 0 }] });
    // A non-explicit, non-filter-matching expense account — must not count.
    createTransaction(db, { profileId: profile.id, date: "2026-09-06", description: "Flight", postings: [{ accountId: bank.id, debit: 0, credit: 90000 }, { accountId: travel.id, debit: 90000, credit: 0 }] });

    const actuals = calculateBudgetActuals(db, period.id, profile.id);
    expect(actuals.totalActualMinor).toBe(5000);
    expect(actuals.rows).toEqual([{ expenseAccountId: food.id, targetAmountMinor: 15_000_00, actualMinor: 5000 }]);
  });

  it("includes a filter-matched account with no allocation, and ignores date range for a one-time budget", () => {
    const db = createTestDb();
    const { profile, bank, food, travel } = setUp(db);
    const { period } = createBudget(db, {
      profileId: profile.id,
      name: "Japan 2026",
      type: "ONE_TIME",
      scope: {
        explicitAccountIds: [],
        filter: { match: "ALL", conditions: [{ id: "1", field: "tags", operator: "contains", value: "japan2026" }] },
      },
    });

    createTransaction(db, {
      profileId: profile.id,
      date: "2020-01-01", // long before "today" — must still count (spec §4.1)
      description: "Flight",
      tags: ["japan2026"],
      postings: [{ accountId: bank.id, debit: 0, credit: 90000 }, { accountId: travel.id, debit: 90000, credit: 0 }],
    });
    createTransaction(db, { profileId: profile.id, date: "2026-09-06", description: "Unrelated groceries", postings: [{ accountId: bank.id, debit: 0, credit: 5000 }, { accountId: food.id, debit: 5000, credit: 0 }] });

    const actuals = calculateBudgetActuals(db, period.id, profile.id);
    expect(actuals.rows).toEqual([{ expenseAccountId: travel.id, targetAmountMinor: null, actualMinor: 90000 }]);
  });
});

describe("listBudgetsWithSummary", () => {
  it("returns one summary row per budget with its current period's actuals", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
      allocations: [{ expenseAccountId: food.id, targetAmountMinor: 15_000_00 }],
    });

    const summaries = listBudgetsWithSummary(db, profile.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].actuals?.totalTargetMinor).toBe(15_000_00);
  });

  it("is never reviewDue for a one-time budget", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    createBudget(db, {
      profileId: profile.id,
      name: "Japan 2026",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
    });

    const summaries = listBudgetsWithSummary(db, profile.id, new Date("2099-01-01T00:00:00Z"));
    expect(summaries[0].reviewDue).toBe(false);
  });

  it("is not reviewDue while the current period is far from ending", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "RECURRING",
      recurrence: { unit: "MONTH", interval: 1, startDate: "2026-09-01" },
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
    });

    // Period 1 is 2026-09-01..2026-09-30; five days in is nowhere near the end.
    const summaries = listBudgetsWithSummary(db, profile.id, new Date("2026-09-06T00:00:00Z"));
    expect(summaries[0].reviewDue).toBe(false);
  });

  it("is reviewDue once the current period is within the review window", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "RECURRING",
      recurrence: { unit: "MONTH", interval: 1, startDate: "2026-09-01" },
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
    });

    // Period 1 ends 2026-09-30 — 2026-09-25 is 5 days out, inside the window.
    const summaries = listBudgetsWithSummary(db, profile.id, new Date("2026-09-25T00:00:00Z"));
    expect(summaries[0].reviewDue).toBe(true);
  });

  it("is reviewDue after the current period has already ended", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "RECURRING",
      recurrence: { unit: "MONTH", interval: 1, startDate: "2026-09-01" },
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
    });

    const summaries = listBudgetsWithSummary(db, profile.id, new Date("2026-10-15T00:00:00Z"));
    expect(summaries[0].reviewDue).toBe(true);
  });

  it("is not reviewDue once the schedule has terminated with no next period", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    createBudget(db, {
      profileId: profile.id,
      name: "Food Expenses",
      type: "RECURRING",
      recurrence: { unit: "MONTH", interval: 1, startDate: "2026-09-01", occurrences: 1 },
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
    });

    const summaries = listBudgetsWithSummary(db, profile.id, new Date("2026-09-29T00:00:00Z"));
    expect(summaries[0].reviewDue).toBe(false);
  });
});
