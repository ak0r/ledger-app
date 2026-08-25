import { describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import { createTransaction } from "./transactions";
import { getDashboardSummary } from "./dashboard";

function setUpLedger(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const account = (name: string, classification: string, instrumentType: string) =>
    createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name,
      classification: classification as never,
      instrumentType: instrumentType as never,
    });

  return {
    profile,
    bank: account("HDFC Bank", "ASSET", "BANK"),
    creditCard: account("HDFC Credit Card", "LIABILITY", "CREDIT_CARD"),
    food: account("Food", "EXPENSE", "EXPENSE"),
    salary: account("Salary", "INCOME", "INCOME"),
  };
}

describe("getDashboardSummary", () => {
  it("computes net position, income, expenses, and recent transactions", () => {
    const db = createTestDb();
    const { profile, bank, creditCard, food, salary } = setUpLedger(db);

    createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-14",
      description: "Salary",
      postings: [
        { accountId: bank.id, debit: 100000, credit: 0 },
        { accountId: salary.id, debit: 0, credit: 100000 },
      ],
    });
    createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: creditCard.id, debit: 0, credit: 2000 },
      ],
    });

    const summary = getDashboardSummary(db, profile.id);

    expect(summary.totalAssets).toBe(100000);
    expect(summary.totalLiabilities).toBe(2000);
    expect(summary.netPosition).toBe(98000);
    expect(summary.totalIncome).toBe(100000);
    expect(summary.totalExpenses).toBe(2000);
    expect(summary.recentTransactions).toHaveLength(2);
    // Most recent first.
    expect(summary.recentTransactions[0].description).toBe("Groceries");
  });

  it("returns zeroed summary for a Profile with no Accounts or Transactions", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const summary = getDashboardSummary(db, profile.id);

    expect(summary.accountBalances).toEqual([]);
    expect(summary.totalAssets).toBe(0);
    expect(summary.netPosition).toBe(0);
    expect(summary.recentTransactions).toEqual([]);
  });
});
