import { describe, expect, it } from "vitest";
import type { Db } from "@/server/persistence/client";
import { createTestDb } from "@/server/testing/createTestDb";
import { createProfile } from "@/server/services/profiles";
import { createCurrency } from "@/server/services/currencies";
import { createAccount } from "@/server/services/accounts";
import { createRecurringRule } from "@/server/services/recurring";
import { createBudget } from "@/server/services/budgets";
import { checkPanelEligibility, listEligiblePanelsForContext } from "./panel-eligibility";

function setUp(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, { profileId: profile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
  const bank = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", instrumentType: "BANK" });
  const rent = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Rent", classification: "EXPENSE", instrumentType: "EXPENSE" });
  return { profile, bank, rent };
}

describe("checkPanelEligibility", () => {
  it("defaults to always eligible for a key with no declared prerequisite", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    expect(checkPanelEligibility(db, profile.id, "MONTHLY_SNAPSHOT")).toEqual({ eligible: true });
    expect(checkPanelEligibility(db, profile.id, "SPENDING_TREND")).toEqual({ eligible: true });
    expect(checkPanelEligibility(db, profile.id, "DAILY_SPENDING_HEATMAP")).toEqual({ eligible: true });
  });

  it("Recurring Expenses is ineligible with no active Recurring Rule", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const result = checkPanelEligibility(db, profile.id, "RECURRING_EXPENSES");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("Recurring Expenses is eligible once an active Recurring Rule exists", () => {
    const db = createTestDb();
    const { profile, bank, rent } = setUp(db);
    createRecurringRule(db, {
      profileId: profile.id,
      name: "Rent",
      fromAccountId: bank.id,
      toAccountId: rent.id,
      amountMinor: 2500000,
      description: "Rent",
      schedule: { frequency: "MONTHLY", interval: 1, byMonthDay: 1, startDate: "2020-01-01" },
    });

    expect(checkPanelEligibility(db, profile.id, "RECURRING_EXPENSES")).toEqual({ eligible: true });
  });

  it("Recurring Expenses is ineligible again once the only rule has ended", () => {
    const db = createTestDb();
    const { profile, bank, rent } = setUp(db);
    createRecurringRule(db, {
      profileId: profile.id,
      name: "Old rule",
      fromAccountId: bank.id,
      toAccountId: rent.id,
      amountMinor: 100,
      description: "Old",
      schedule: { frequency: "MONTHLY", interval: 1, byMonthDay: 1, startDate: "2010-01-01", endDate: "2010-06-01" },
    });

    expect(checkPanelEligibility(db, profile.id, "RECURRING_EXPENSES").eligible).toBe(false);
  });

  it("Credit Card Health is ineligible with no Credit Card account, eligible once one exists", () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    expect(checkPanelEligibility(db, profile.id, "CREDIT_CARD_HEALTH").eligible).toBe(false);

    const currency = createCurrency(db, { profileId: profile.id, code: "USD", name: "US Dollar", symbol: "$", minorUnitScale: 2 });
    createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "Card", classification: "LIABILITY", instrumentType: "CREDIT_CARD" });

    expect(checkPanelEligibility(db, profile.id, "CREDIT_CARD_HEALTH")).toEqual({ eligible: true });
  });

  it("Budget Health is ineligible with no Budget, eligible once one exists", () => {
    const db = createTestDb();
    const { profile, rent } = setUp(db);
    expect(checkPanelEligibility(db, profile.id, "BUDGET_HEALTH").eligible).toBe(false);

    createBudget(db, {
      profileId: profile.id,
      name: "Rent Budget",
      type: "ONE_TIME",
      scope: { explicitAccountIds: [rent.id], filter: { match: "ALL", conditions: [] } },
      allocations: [{ expenseAccountId: rent.id, targetAmountMinor: 25000 }],
    });

    expect(checkPanelEligibility(db, profile.id, "BUDGET_HEALTH")).toEqual({ eligible: true });
  });
});

describe("listEligiblePanelsForContext", () => {
  it("only returns keys belonging to the requested context", () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const spending = listEligiblePanelsForContext(db, profile.id, "SPENDING");
    const keys = spending.map((p) => p.key).sort();

    expect(keys).toEqual(["BUDGET_HEALTH", "CREDIT_CARD_HEALTH", "DAILY_SPENDING_HEATMAP", "RECURRING_EXPENSES", "SPENDING_TREND"]);
  });

  it("includes the eligibility result per key", () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const spending = listEligiblePanelsForContext(db, profile.id, "SPENDING");
    const recurring = spending.find((p) => p.key === "RECURRING_EXPENSES")!;

    expect(recurring.eligibility.eligible).toBe(false);
  });
});
