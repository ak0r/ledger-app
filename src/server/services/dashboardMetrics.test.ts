import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import { createTransaction } from "./transactions";
import { createRecurringRule } from "./recurring";
import { approveBudgetPeriod, createBudget, previewNextBudgetPeriod } from "./budgets";
import {
  getAttentionSignals,
  getBudgetHealth,
  getClassificationTotalForWindow,
  getCreditCardHealth,
  getDailyExpenseTotals,
  getMonthlySnapshot,
  getMonthlyTotalsSeries,
  getRecurringExpensesSummary,
  getSavingsRateTrend,
  getSpendingTrend,
} from "./dashboardMetrics";
import { monthWindow } from "@/core";

function setUp(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, { profileId: profile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
  const bank = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", accountType: "BANK" });
  const food = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Food", classification: "EXPENSE", accountType: "VARIABLE" });
  const salary = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Salary", classification: "INCOME", accountType: "EARNED" });
  const card = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Credit Card", classification: "LIABILITY", accountType: "CREDIT_CARD" });
  return { profile, bank, food, salary, card };
}

describe("getClassificationTotalForWindow", () => {
  it("sums debit-side activity for EXPENSE accounts within the window", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "Groceries", postings: [{ accountId: bank.id, debit: 0, credit: 5000 }, { accountId: food.id, debit: 5000, credit: 0 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-08-05", description: "Old groceries", postings: [{ accountId: bank.id, debit: 0, credit: 3000 }, { accountId: food.id, debit: 3000, credit: 0 }] });

    const total = getClassificationTotalForWindow(db, profile.id, "EXPENSE", monthWindow(2026, 8));
    expect(total).toBe(5000);
  });

  it("sums credit-side activity for INCOME accounts within the window", () => {
    const db = createTestDb();
    const { profile, bank, salary } = setUp(db);
    createTransaction(db, { profileId: profile.id, date: "2026-09-01", description: "Salary", postings: [{ accountId: bank.id, debit: 200000, credit: 0 }, { accountId: salary.id, debit: 0, credit: 200000 }] });

    const total = getClassificationTotalForWindow(db, profile.id, "INCOME", monthWindow(2026, 8));
    expect(total).toBe(200000);
  });
});

describe("getMonthlyTotalsSeries", () => {
  it("returns one total per trailing month, oldest first", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    createTransaction(db, { profileId: profile.id, date: "2026-08-01", description: "August", postings: [{ accountId: bank.id, debit: 0, credit: 1000 }, { accountId: food.id, debit: 1000, credit: 0 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-09-01", description: "September", postings: [{ accountId: bank.id, debit: 0, credit: 2000 }, { accountId: food.id, debit: 2000, credit: 0 }] });

    const series = getMonthlyTotalsSeries(db, profile.id, "EXPENSE", 2, new Date("2026-09-06T00:00:00Z"));

    expect(series).toEqual([
      { startIso: "2026-08-01", totalMinor: 1000 },
      { startIso: "2026-09-01", totalMinor: 2000 },
    ]);
  });
});

describe("getDailyExpenseTotals", () => {
  it("buckets Expense totals by exact date, not by month", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "A", postings: [{ accountId: bank.id, debit: 0, credit: 100 }, { accountId: food.id, debit: 100, credit: 0 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "B", postings: [{ accountId: bank.id, debit: 0, credit: 200 }, { accountId: food.id, debit: 200, credit: 0 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-09-06", description: "C", postings: [{ accountId: bank.id, debit: 0, credit: 50 }, { accountId: food.id, debit: 50, credit: 0 }] });

    const totals = getDailyExpenseTotals(db, profile.id, "2026-09-01", "2026-10-01");

    expect(totals.get("2026-09-05")).toBe(300);
    expect(totals.get("2026-09-06")).toBe(50);
    expect(totals.get("2026-09-07")).toBeUndefined();
  });
});

describe("getRecurringExpensesSummary", () => {
  it("only includes rules with a future/current occurrence", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    createRecurringRule(db, {
      profileId: profile.id,
      name: "Rent",
      fromAccountId: bank.id,
      toAccountId: food.id,
      amountMinor: 250000,
      description: "Rent",
      schedule: { frequency: "MONTHLY", interval: 1, byMonthDay: 1, startDate: "2020-01-01" },
    });
    createRecurringRule(db, {
      profileId: profile.id,
      name: "Ended subscription",
      fromAccountId: bank.id,
      toAccountId: food.id,
      amountMinor: 100,
      description: "Ended",
      schedule: { frequency: "MONTHLY", interval: 1, byMonthDay: 1, startDate: "2010-01-01", endDate: "2010-06-01" },
    });

    const summary = getRecurringExpensesSummary(db, profile.id, new Date("2026-09-06T00:00:00Z"));

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]!.name).toBe("Rent");
    expect(summary.totalMonthlyEquivalentMinor).toBe(250000);
  });
});

describe("getMonthlySnapshot", () => {
  it("computes income/spent/saved/rate for this month vs the previous month", () => {
    const db = createTestDb();
    const { profile, bank, food, salary } = setUp(db);
    createTransaction(db, { profileId: profile.id, date: "2026-09-01", description: "Salary", postings: [{ accountId: bank.id, debit: 200000, credit: 0 }, { accountId: salary.id, debit: 0, credit: 200000 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "Groceries", postings: [{ accountId: bank.id, debit: 0, credit: 142000 }, { accountId: food.id, debit: 142000, credit: 0 }] });

    const snapshot = getMonthlySnapshot(db, profile.id, new Date("2026-09-06T00:00:00Z"));

    expect(snapshot.incomeMinor).toBe(200000);
    expect(snapshot.spentMinor).toBe(142000);
    expect(snapshot.savedMinor).toBe(58000);
    expect(snapshot.savingsRatePercent).toBeCloseTo(29, 0);
    expect(snapshot.previousIncomeMinor).toBe(0);
  });

  it("returns a null savings rate when there was no income, not a fabricated one", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const snapshot = getMonthlySnapshot(db, profile.id, new Date("2026-09-06T00:00:00Z"));
    expect(snapshot.savingsRatePercent).toBeNull();
  });
});

describe("getSpendingTrend", () => {
  it("compares this month's spend against a trailing rolling average excluding this month", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    // Two prior months at 1000 each -> average 1000; this month at 1200 -> +20%.
    createTransaction(db, { profileId: profile.id, date: "2026-07-05", description: "Jul", postings: [{ accountId: bank.id, debit: 0, credit: 1000 }, { accountId: food.id, debit: 1000, credit: 0 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-08-05", description: "Aug", postings: [{ accountId: bank.id, debit: 0, credit: 1000 }, { accountId: food.id, debit: 1000, credit: 0 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "Sep", postings: [{ accountId: bank.id, debit: 0, credit: 1200 }, { accountId: food.id, debit: 1200, credit: 0 }] });

    const trend = getSpendingTrend(db, profile.id, 2, new Date("2026-09-06T00:00:00Z"));

    expect(trend.thisMonthMinor).toBe(1200);
    expect(trend.rollingAverageMinor).toBe(1000);
    expect(trend.percentVsAverage).toBeCloseTo(20, 0);
  });
});

describe("getSavingsRateTrend", () => {
  it("compares this month's savings rate against a trailing average, excluding months with no income", () => {
    const db = createTestDb();
    const { profile, bank, food, salary } = setUp(db);
    // July: income 1000, spend 500 -> 50% rate. August: no income at all (excluded from the average).
    createTransaction(db, { profileId: profile.id, date: "2026-07-01", description: "Jul salary", postings: [{ accountId: bank.id, debit: 1000, credit: 0 }, { accountId: salary.id, debit: 0, credit: 1000 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-07-05", description: "Jul spend", postings: [{ accountId: bank.id, debit: 0, credit: 500 }, { accountId: food.id, debit: 500, credit: 0 }] });
    // September (current): income 1000, spend 200 -> 80% rate.
    createTransaction(db, { profileId: profile.id, date: "2026-09-01", description: "Sep salary", postings: [{ accountId: bank.id, debit: 1000, credit: 0 }, { accountId: salary.id, debit: 0, credit: 1000 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "Sep spend", postings: [{ accountId: bank.id, debit: 0, credit: 200 }, { accountId: food.id, debit: 200, credit: 0 }] });

    const trend = getSavingsRateTrend(db, profile.id, 2, new Date("2026-09-06T00:00:00Z"));

    expect(trend.currentRatePercent).toBeCloseTo(80, 0);
    expect(trend.averageRatePercent).toBeCloseTo(50, 0); // August excluded, only July counts
    expect(trend.deltaPoints).toBeCloseTo(30, 0);
  });

  it("returns nulls when there's no income anywhere to compute a rate from", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const trend = getSavingsRateTrend(db, profile.id, 2, new Date("2026-09-06T00:00:00Z"));
    expect(trend).toEqual({ currentRatePercent: null, averageRatePercent: null, deltaPoints: null });
  });
});

describe("getCreditCardHealth", () => {
  it("sums the credit side of Credit Card accounts as spend, and the current balance as outstanding", () => {
    const db = createTestDb();
    const { profile, food, card } = setUp(db);
    // A card purchase credits the card account (docs/03-accounting-principles.md).
    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "Purchase", postings: [{ accountId: food.id, debit: 800, credit: 0 }, { accountId: card.id, debit: 0, credit: 800 }] });
    createTransaction(db, { profileId: profile.id, date: "2026-08-05", description: "Old purchase", postings: [{ accountId: food.id, debit: 400, credit: 0 }, { accountId: card.id, debit: 0, credit: 400 }] });

    const health = getCreditCardHealth(db, profile.id, 1, new Date("2026-09-06T00:00:00Z"));

    expect(health.thisMonthSpendMinor).toBe(800);
    expect(health.averageSpendMinor).toBe(400);
    expect(health.percentVsAverage).toBeCloseTo(100, 0);
    expect(health.outstandingBalanceMinor).toBe(1200);
  });

  it("returns zeroes and a null percent when there's no Credit Card account at all", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "No Card" });
    const health = getCreditCardHealth(db, profile.id, 1, new Date("2026-09-06T00:00:00Z"));
    expect(health).toEqual({ thisMonthSpendMinor: 0, averageSpendMinor: 0, percentVsAverage: null, outstandingBalanceMinor: 0 });
  });
});

describe("getBudgetHealth", () => {
  it("computes pace-based expected spend and counts exceeded past periods from real Budget history", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);

    const { budget } = createBudget(db, {
      profileId: profile.id,
      name: "Food Budget",
      type: "RECURRING",
      recurrence: { unit: "MONTH", interval: 1, startDate: "2026-07-01" },
      scope: { explicitAccountIds: [food.id], filter: { match: "ALL", conditions: [] } },
      allocations: [{ expenseAccountId: food.id, targetAmountMinor: 100000 }],
    });
    // July: exceeded (150000 > 100000).
    createTransaction(db, { profileId: profile.id, date: "2026-07-10", description: "Jul", postings: [{ accountId: food.id, debit: 150000, credit: 0 }, { accountId: food.id, debit: 0, credit: 150000 }] });

    const augustPreview = previewNextBudgetPeriod(db, budget.id, profile.id)!;
    approveBudgetPeriod(db, { budgetId: budget.id, profileId: profile.id, startDate: augustPreview.window.startDate, endDate: augustPreview.window.endDate, scope: augustPreview.defaults.scope, allocations: augustPreview.defaults.allocations });
    // August: under target (50000 < 100000).
    createTransaction(db, { profileId: profile.id, date: "2026-08-10", description: "Aug", postings: [{ accountId: food.id, debit: 50000, credit: 0 }, { accountId: food.id, debit: 0, credit: 50000 }] });

    const septemberPreview = previewNextBudgetPeriod(db, budget.id, profile.id)!;
    approveBudgetPeriod(db, { budgetId: budget.id, profileId: profile.id, startDate: septemberPreview.window.startDate, endDate: septemberPreview.window.endDate, scope: septemberPreview.defaults.scope, allocations: septemberPreview.defaults.allocations });
    // September (current, in progress): 40000 spent so far.
    createTransaction(db, { profileId: profile.id, date: "2026-09-10", description: "Sep", postings: [{ accountId: food.id, debit: 40000, credit: 0 }, { accountId: food.id, debit: 0, credit: 40000 }] });

    const health = getBudgetHealth(db, profile.id, new Date("2026-09-15T00:00:00Z"));

    expect(health).toHaveLength(1);
    const line = health[0]!;
    expect(line.actualMinor).toBe(40000);
    expect(line.targetMinor).toBe(100000);
    // 15 of 30 days elapsed in September -> expected ~50000.
    expect(line.expectedByTodayMinor).toBeCloseTo(50000, -3);
    expect(line.exceededCount).toBe(1); // July only
    expect(line.consideredPeriodCount).toBe(2); // July + August, not the current September period
  });
});

describe("getAttentionSignals", () => {
  it("never invents a new calculation — returns nothing when nothing crosses any threshold", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    expect(getAttentionSignals(db, profile.id, new Date("2026-09-06T00:00:00Z"))).toEqual([]);
  });

  it("surfaces a warning when spending is well above the 6-month average", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    for (let month = 3; month <= 8; month++) {
      createTransaction(db, { profileId: profile.id, date: `2026-0${month}-05`, description: "Prior", postings: [{ accountId: bank.id, debit: 0, credit: 1000 }, { accountId: food.id, debit: 1000, credit: 0 }] });
    }
    createTransaction(db, { profileId: profile.id, date: "2026-09-05", description: "This month", postings: [{ accountId: bank.id, debit: 0, credit: 5000 }, { accountId: food.id, debit: 5000, credit: 0 }] });

    const signals = getAttentionSignals(db, profile.id, new Date("2026-09-06T00:00:00Z"));

    expect(signals.some((s) => s.kind === "warning" && s.message.includes("above your 6-month average"))).toBe(true);
  });
});
