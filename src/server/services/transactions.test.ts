import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { postings, transactions } from "../persistence/schema";
import { createTestDb } from "../testing/createTestDb";
import { findPostingsByTransaction, findTransactionById } from "../repositories/transactions";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import {
  bulkDeleteTransactions,
  bulkUpdateTags,
  createTransaction,
  deleteTransaction,
  editTransaction,
  listTransactions,
  mergeTransactions,
} from "./transactions";
import { MergeIneligibleError, NotFoundError, TransactionValidationError } from "./errors";

function setUpLedger(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const account = (name: string, classification: string, accountType: string) =>
    createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name,
      classification: classification as never,
      accountType: accountType as never,
    });

  return {
    profile,
    bank: account("HDFC Bank", "ASSET", "BANK"),
    food: account("Food Expense", "EXPENSE", "VARIABLE"),
    creditCard: account("HDFC Credit Card", "LIABILITY", "CREDIT_CARD"),
    salary: account("Salary Income", "INCOME", "EARNED"),
  };
}

describe("createTransaction", () => {
  it("persists a balanced expense transaction with its postings", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);

    const transaction = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(transaction.postings).toHaveLength(2);
    expect(findTransactionById(db, transaction.id, profile.id)).toBeDefined();
    expect(findPostingsByTransaction(db, transaction.id)).toHaveLength(2);
  });

  it("rejects an unbalanced transaction and writes nothing (atomicity)", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);

    expect(() =>
      createTransaction(db, {
        profileId: profile.id,
        date: "2026-08-15",
        description: "Broken",
        postings: [
          { accountId: food.id, debit: 2000, credit: 0 },
          { accountId: bank.id, debit: 0, credit: 1900 },
        ],
      }),
    ).toThrow(TransactionValidationError);

    // Exit criteria: an ownership/balance-violating write is rejected in the
    // application layer even though the UI would never construct one, and
    // it must leave zero trace behind — no partially posted transaction.
    expect(db.select().from(transactions).all()).toEqual([]);
    expect(db.select().from(postings).all()).toEqual([]);
  });

  it("persists a Currency Conversion — two unequal, independent leg amounts, end to end", () => {
    const db = createTestDb();
    const { profile, bank } = setUpLedger(db);
    const jpy = createCurrency(db, {
      profileId: profile.id,
      code: "JPY",
      name: "Japanese Yen",
      symbol: "¥",
      minorUnitScale: 0,
    });
    const jpyCash = createAccount(db, {
      profileId: profile.id,
      currencyId: jpy.id,
      name: "JPY in Hand",
      classification: "ASSET",
      accountType: "CASH",
    });

    const transaction = createTransaction(db, {
      profileId: profile.id,
      date: "2026-09-03",
      description: "Convert Cash",
      postings: [
        { accountId: bank.id, debit: 0, credit: 1000000 }, // ₹10,000 out
        { accountId: jpyCash.id, debit: 15000, credit: 0, rateDecimal: 10000 / 15000 }, // ¥15,000 in @ ~₹0.6667/¥
      ],
    });

    const persistedPostings = findPostingsByTransaction(db, transaction.id);
    expect(persistedPostings).toHaveLength(2);
    expect(persistedPostings.find((p) => p.accountId === bank.id)?.units).toBe(-1000000);
    expect(persistedPostings.find((p) => p.accountId === jpyCash.id)?.units).toBe(15000);
  });

  it("rejects a posting against another Profile's account (ownership invariant)", () => {
    const db = createTestDb();
    const { profile, food } = setUpLedger(db);
    const otherLedger = setUpLedger(db);

    expect(() =>
      createTransaction(db, {
        profileId: profile.id,
        date: "2026-08-15",
        description: "Cross-profile write attempt",
        postings: [
          { accountId: food.id, debit: 1000, credit: 0 },
          { accountId: otherLedger.bank.id, debit: 0, credit: 1000 },
        ],
      }),
    ).toThrow(TransactionValidationError);
  });
});

describe("createTransaction — genuine N-leg multi-currency (Transaction Form FX UX delta)", () => {
  it("accepts a 1-From/N-To split with two independently-priced foreign legs (no currency-count restriction anymore)", () => {
    const db = createTestDb();
    const { profile, bank } = setUpLedger(db);
    const jpy = createCurrency(db, { profileId: profile.id, code: "JPY", name: "Japanese Yen", symbol: "¥", minorUnitScale: 0 });
    const jpyCash = createAccount(db, { profileId: profile.id, currencyId: jpy.id, name: "JPY Cash", classification: "ASSET", accountType: "CASH" });
    const usd = createCurrency(db, { profileId: profile.id, code: "USD", name: "US Dollar", symbol: "$", minorUnitScale: 2 });
    const usdCash = createAccount(db, { profileId: profile.id, currencyId: usd.id, name: "USD Cash", classification: "ASSET", accountType: "CASH" });

    const transaction = createTransaction(db, {
      profileId: profile.id,
      date: "2026-09-03",
      description: "Trip expenses",
      postings: [
        { accountId: bank.id, debit: 0, credit: 1000000 }, // ₹10,000 out
        { accountId: jpyCash.id, debit: 9000, credit: 0, rateDecimal: 0.65 }, // ¥9,000 @ ₹0.65 = ₹5,850
        { accountId: usdCash.id, debit: 5000, credit: 0, rateDecimal: 83 }, // $50.00 @ ₹83 = ₹4,150
      ],
    });

    const persisted = findPostingsByTransaction(db, transaction.id);
    expect(persisted).toHaveLength(3);
    expect(persisted.find((p) => p.accountId === bank.id)?.baseAmount).toBe(-1000000);
    expect(persisted.find((p) => p.accountId === jpyCash.id)?.baseAmount).toBe(585000);
    expect(persisted.find((p) => p.accountId === usdCash.id)?.baseAmount).toBe(415000);
    expect(
      persisted.reduce((sum, p) => sum + p.baseAmount!, 0),
    ).toBe(0);
  });

  it("rejects a foreign leg whose amount/rate genuinely doesn't reconcile — never silently absorbs an arbitrary mismatch", () => {
    const db = createTestDb();
    const { profile, bank } = setUpLedger(db);
    const jpy = createCurrency(db, { profileId: profile.id, code: "JPY", name: "Japanese Yen", symbol: "¥", minorUnitScale: 0 });
    const jpyCash = createAccount(db, { profileId: profile.id, currencyId: jpy.id, name: "JPY Cash", classification: "ASSET", accountType: "CASH" });

    // ¥9,000 @ ₹0.65 implies ₹5,850, nowhere near the ₹10,000 credited —
    // a real typo/mismatch, not rounding noise. Must be rejected honestly,
    // not silently forced to "balance" by rewriting the bank leg's own
    // entered amount.
    expect(() =>
      createTransaction(db, {
        profileId: profile.id,
        date: "2026-09-03",
        description: "Broken conversion",
        postings: [
          { accountId: bank.id, debit: 0, credit: 1000000 },
          { accountId: jpyCash.id, debit: 9000, credit: 0, rateDecimal: 0.65 },
        ],
      }),
    ).toThrow(TransactionValidationError);
  });

  it("falls back to the CurrencyRate default (or 1/1 parity) when a foreign leg's rateDecimal is omitted", () => {
    const db = createTestDb();
    const { profile, bank } = setUpLedger(db);
    const jpy = createCurrency(db, { profileId: profile.id, code: "JPY", name: "Japanese Yen", symbol: "¥", minorUnitScale: 0 });
    const jpyCash = createAccount(db, { profileId: profile.id, currencyId: jpy.id, name: "JPY Cash", classification: "ASSET", accountType: "CASH" });

    // No CurrencyRate history exists for JPY -> parity fallback (delta's
    // own rule, minor-unit-to-minor-unit: 1 paisa per ¥1) -> ¥9,000 prices
    // at just ₹90.00 (9000 paise), nowhere near the ₹10,000 credited ->
    // honestly rejected, not silently forced to balance.
    expect(() =>
      createTransaction(db, {
        profileId: profile.id,
        date: "2026-09-03",
        description: "No rate on file",
        postings: [
          { accountId: bank.id, debit: 0, credit: 1000000 },
          { accountId: jpyCash.id, debit: 9000, credit: 0 },
        ],
      }),
    ).toThrow(TransactionValidationError);
  });
});

describe("editTransaction (full replace)", () => {
  it("atomically swaps postings under the same transaction id", () => {
    const db = createTestDb();
    const { profile, bank, food, creditCard } = setUpLedger(db);
    const original = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    const edited = editTransaction(db, {
      transactionId: original.id,
      profileId: profile.id,
      date: "2026-08-16",
      description: "Groceries (corrected — paid by credit card)",
      postings: [
        { accountId: food.id, debit: 2500, credit: 0 },
        { accountId: creditCard.id, debit: 0, credit: 2500 },
      ],
    });

    expect(edited.id).toBe(original.id);
    expect(edited.description).toContain("corrected");

    const postings = findPostingsByTransaction(db, original.id);
    expect(postings).toHaveLength(2);
    expect(postings.map((p) => p.accountId).sort()).toEqual(
      [food.id, creditCard.id].sort(),
    );
    expect(postings.some((p) => p.accountId === bank.id)).toBe(false);
  });

  it("rejects an unbalanced edit and leaves the original postings untouched", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const original = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(() =>
      editTransaction(db, {
        transactionId: original.id,
        profileId: profile.id,
        date: "2026-08-15",
        description: "Broken edit",
        postings: [
          { accountId: food.id, debit: 3000, credit: 0 },
          { accountId: bank.id, debit: 0, credit: 2000 },
        ],
      }),
    ).toThrow(TransactionValidationError);

    const postings = findPostingsByTransaction(db, original.id);
    expect(postings).toHaveLength(2);
    expect(postings.find((p) => p.accountId === food.id)?.units).toBe(2000);
  });

  it("rejects editing another Profile's transaction (rule #6)", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const otherLedger = setUpLedger(db);
    const original = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(() =>
      editTransaction(db, {
        transactionId: original.id,
        profileId: otherLedger.profile.id,
        date: "2026-08-15",
        description: "Should not apply",
        postings: [
          { accountId: otherLedger.food.id, debit: 2000, credit: 0 },
          { accountId: otherLedger.bank.id, debit: 0, credit: 2000 },
        ],
      }),
    ).toThrow(NotFoundError);
  });
});

describe("deleteTransaction", () => {
  it("hard-deletes the transaction and cascades its postings (rule #9)", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const transaction = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    deleteTransaction(db, { transactionId: transaction.id, profileId: profile.id });

    expect(findTransactionById(db, transaction.id, profile.id)).toBeUndefined();
    expect(findPostingsByTransaction(db, transaction.id)).toEqual([]);
  });

  it("rejects deleting another Profile's transaction (rule #6) and does not corrupt it", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const otherLedger = setUpLedger(db);
    const transaction = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(() =>
      deleteTransaction(db, {
        transactionId: transaction.id,
        profileId: otherLedger.profile.id,
      }),
    ).toThrow(NotFoundError);

    expect(findTransactionById(db, transaction.id, profile.id)).toBeDefined();
    expect(findPostingsByTransaction(db, transaction.id)).toHaveLength(2);
  });
});

describe("bulkDeleteTransactions", () => {
  it("hard-deletes every transaction in the selection", () => {
    const db = createTestDb();
    const { profile, bank, food, creditCard } = setUpLedger(db);
    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    const t2 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-16",
      description: "Snacks",
      postings: [
        { accountId: food.id, debit: 500, credit: 0 },
        { accountId: creditCard.id, debit: 0, credit: 500 },
      ],
    });

    bulkDeleteTransactions(db, { profileId: profile.id, transactionIds: [t1.id, t2.id] });

    expect(findTransactionById(db, t1.id, profile.id)).toBeUndefined();
    expect(findTransactionById(db, t2.id, profile.id)).toBeUndefined();
    expect(listTransactions(db, profile.id)).toHaveLength(0);
  });

  it("rejects the whole batch when one id doesn't belong to this Profile, deleting nothing (atomicity)", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const otherLedger = setUpLedger(db);
    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    const otherTransaction = createTransaction(db, {
      profileId: otherLedger.profile.id,
      date: "2026-08-15",
      description: "Not this profile's",
      postings: [
        { accountId: otherLedger.food.id, debit: 500, credit: 0 },
        { accountId: otherLedger.bank.id, debit: 0, credit: 500 },
      ],
    });

    expect(() =>
      bulkDeleteTransactions(db, {
        profileId: profile.id,
        transactionIds: [t1.id, otherTransaction.id],
      }),
    ).toThrow(NotFoundError);

    expect(findTransactionById(db, t1.id, profile.id)).toBeDefined();
    expect(
      findTransactionById(db, otherTransaction.id, otherLedger.profile.id),
    ).toBeDefined();
  });
});

describe("bulkUpdateTags", () => {
  it("adds and removes tags across every transaction in the selection", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      tags: ["Home"],
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    const t2 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-16",
      description: "Snacks",
      tags: ["Japan2026", "Home"],
      postings: [
        { accountId: food.id, debit: 500, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 500 },
      ],
    });

    bulkUpdateTags(db, {
      profileId: profile.id,
      transactionIds: [t1.id, t2.id],
      addTags: ["Japan2026"],
      removeTags: ["Home"],
    });

    const updated1 = findTransactionById(db, t1.id, profile.id);
    const updated2 = findTransactionById(db, t2.id, profile.id);
    expect(updated1?.tags).toEqual(["Japan2026"]);
    expect(updated2?.tags).toEqual(["Japan2026"]);
  });

  it("clears tags to null when every tag is removed and none added", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      tags: ["Home"],
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    bulkUpdateTags(db, {
      profileId: profile.id,
      transactionIds: [t1.id],
      addTags: [],
      removeTags: ["Home"],
    });

    expect(findTransactionById(db, t1.id, profile.id)?.tags).toBeNull();
  });

  it("rejects the whole batch when one id doesn't belong to this Profile, changing nothing (atomicity)", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const otherLedger = setUpLedger(db);
    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      tags: ["Home"],
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    const otherTransaction = createTransaction(db, {
      profileId: otherLedger.profile.id,
      date: "2026-08-15",
      description: "Not this profile's",
      postings: [
        { accountId: otherLedger.food.id, debit: 500, credit: 0 },
        { accountId: otherLedger.bank.id, debit: 0, credit: 500 },
      ],
    });

    expect(() =>
      bulkUpdateTags(db, {
        profileId: profile.id,
        transactionIds: [t1.id, otherTransaction.id],
        addTags: ["Japan2026"],
        removeTags: [],
      }),
    ).toThrow(NotFoundError);

    expect(findTransactionById(db, t1.id, profile.id)?.tags).toEqual(["Home"]);
  });
});

describe("mergeTransactions", () => {
  it("replaces two eligible transactions with one balanced union of their postings", () => {
    const db = createTestDb();
    const { profile, bank, food, creditCard } = setUpLedger(db);
    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    const t2 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Snacks",
      postings: [
        { accountId: creditCard.id, debit: 500, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 500 },
      ],
    });

    const merged = mergeTransactions(db, {
      profileId: profile.id,
      transactionIds: [t1.id, t2.id],
    });

    expect(merged.description).toBe("Groceries + Snacks");
    expect(merged.postings).toHaveLength(4);
    const totalDebit = merged.postings.reduce((sum, p) => sum + Math.max(p.units, 0), 0);
    const totalCredit = merged.postings.reduce((sum, p) => sum + Math.max(-p.units, 0), 0);
    expect(totalDebit).toBe(totalCredit);

    // Originals are gone (hard-replaced), only the merged transaction remains.
    expect(findTransactionById(db, t1.id, profile.id)).toBeUndefined();
    expect(findTransactionById(db, t2.id, profile.id)).toBeUndefined();
    expect(listTransactions(db, profile.id)).toHaveLength(1);
  });

  it("rejects an ineligible merge and leaves both originals untouched (atomicity)", () => {
    const db = createTestDb();
    const { profile, bank, food, creditCard, salary } = setUpLedger(db);
    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    const t2 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-16", // different date — no common date, no common account
      description: "Paycheck",
      postings: [
        { accountId: bank.id, debit: 1000, credit: 0 },
        { accountId: salary.id, debit: 0, credit: 1000 },
      ],
    });
    void creditCard;

    expect(() =>
      mergeTransactions(db, { profileId: profile.id, transactionIds: [t1.id, t2.id] }),
    ).toThrow(MergeIneligibleError);

    expect(findTransactionById(db, t1.id, profile.id)).toBeDefined();
    expect(findTransactionById(db, t2.id, profile.id)).toBeDefined();
    expect(findPostingsByTransaction(db, t1.id)).toHaveLength(2);
    expect(findPostingsByTransaction(db, t2.id)).toHaveLength(2);
  });

  it("rejects merging another Profile's transaction (rule #6) and touches nothing", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const otherLedger = setUpLedger(db);
    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    const otherTransaction = createTransaction(db, {
      profileId: otherLedger.profile.id,
      date: "2026-08-15",
      description: "Not this profile's",
      postings: [
        { accountId: otherLedger.food.id, debit: 500, credit: 0 },
        { accountId: otherLedger.bank.id, debit: 0, credit: 500 },
      ],
    });

    expect(() =>
      mergeTransactions(db, {
        profileId: profile.id,
        transactionIds: [t1.id, otherTransaction.id],
      }),
    ).toThrow(NotFoundError);

    expect(findTransactionById(db, t1.id, profile.id)).toBeDefined();
    expect(findPostingsByTransaction(db, t1.id)).toHaveLength(2);
    expect(
      findTransactionById(db, otherTransaction.id, otherLedger.profile.id),
    ).toBeDefined();
  });
});

describe("listTransactions", () => {
  it("returns every Transaction for the Profile with postings attached, scoped by profileId", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUpLedger(db);
    const otherLedger = setUpLedger(db);

    const t1 = createTransaction(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    createTransaction(db, {
      profileId: otherLedger.profile.id,
      date: "2026-08-15",
      description: "Not this profile's",
      postings: [
        { accountId: otherLedger.food.id, debit: 500, credit: 0 },
        { accountId: otherLedger.bank.id, debit: 0, credit: 500 },
      ],
    });

    const list = listTransactions(db, profile.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(t1.id);
    expect(list[0].postings).toHaveLength(2);
  });
});
