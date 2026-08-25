import { describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { postings, transactions } from "../db/schema";
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
    food: account("Food Expense", "EXPENSE", "EXPENSE"),
    creditCard: account("HDFC Credit Card", "LIABILITY", "CREDIT_CARD"),
    salary: account("Salary Income", "INCOME", "INCOME"),
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
    expect(postings.find((p) => p.accountId === food.id)?.debit).toBe(2000);
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
    const totalDebit = merged.postings.reduce((sum, p) => sum + p.debit, 0);
    const totalCredit = merged.postings.reduce((sum, p) => sum + p.credit, 0);
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
