import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfileCore } from "./profiles.core";
import { createCurrencyCore } from "./currencies.core";
import { createAccountCore } from "./accounts.core";
import { createTransactionCore } from "./transactions.core";

// End-to-end smoke test: a Profile, its Accounts, and a Transaction can be
// created through the API layer alone — nothing here reaches past the
// action layer into repositories/use-cases directly.
describe("Phase 5 exit criteria: end-to-end through the action layer", () => {
  it("creates a Profile, Currency, two Accounts, and a balanced Transaction", () => {
    const db = createTestDb();

    const profile = createProfileCore(db, { name: "Amit" });
    expect(profile.success).toBe(true);
    if (!profile.success) return;

    const currency = createCurrencyCore(db, {
      profileId: profile.data.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });
    expect(currency.success).toBe(true);
    if (!currency.success) return;

    const bank = createAccountCore(db, {
      profileId: profile.data.id,
      currencyId: currency.data.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });
    const food = createAccountCore(db, {
      profileId: profile.data.id,
      currencyId: currency.data.id,
      name: "Food Expense",
      classification: "EXPENSE",
      instrumentType: "EXPENSE",
    });
    expect(bank.success).toBe(true);
    expect(food.success).toBe(true);
    if (!bank.success || !food.success) return;

    const transaction = createTransactionCore(db, {
      profileId: profile.data.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.data.id, debit: 2000, credit: 0 },
        { accountId: bank.data.id, debit: 0, credit: 2000 },
      ],
    });

    expect(transaction.success).toBe(true);
    if (transaction.success) {
      expect(transaction.data.postings).toHaveLength(2);
    }
  });
});
