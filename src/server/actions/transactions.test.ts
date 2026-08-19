import { describe, expect, it } from "vitest";
import type { Db } from "../db/family-client";
import { createTestDb } from "../testing/createTestDb";
import { createMember } from "../use-cases/members";
import { createCurrency } from "../use-cases/currencies";
import { createAccount } from "../use-cases/accounts";
import {
  createTransactionCore,
  deleteTransactionCore,
  editTransactionCore,
} from "./transactions.core";

function setUp(db: Db) {
  const member = createMember(db, { name: "Amit" });
  const currency = createCurrency(db, {
    memberId: member.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const account = (name: string, classification: string, instrumentType: string) =>
    createAccount(db, {
      memberId: member.id,
      currencyId: currency.id,
      name,
      classification: classification as never,
      instrumentType: instrumentType as never,
    });
  return {
    member,
    bank: account("HDFC Bank", "ASSET", "BANK"),
    food: account("Food Expense", "EXPENSE", "EXPENSE"),
  };
}

describe("createTransactionCore", () => {
  it("creates a balanced transaction", () => {
    const db = createTestDb();
    const { member, bank, food } = setUp(db);

    const result = createTransactionCore(db, {
      memberId: member.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unbalanced transaction at the Zod boundary — fast feedback", () => {
    const db = createTestDb();
    const { member, bank, food } = setUp(db);

    const result = createTransactionCore(db, {
      memberId: member.id,
      date: "2026-08-15",
      description: "Broken",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 1900 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/balance/i);
  });

  it("rejects a posting to another Member's account — only the domain layer can catch this", () => {
    const db = createTestDb();
    const { member, food } = setUp(db);
    const otherLedger = setUp(db);

    const result = createTransactionCore(db, {
      memberId: member.id,
      date: "2026-08-15",
      description: "Cross-member write attempt",
      postings: [
        { accountId: food.id, debit: 1000, credit: 0 },
        { accountId: otherLedger.bank.id, debit: 0, credit: 1000 },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("editTransactionCore and deleteTransactionCore", () => {
  it("full-replaces a transaction's postings", () => {
    const db = createTestDb();
    const { member, bank, food } = setUp(db);
    const created = createTransactionCore(db, {
      memberId: member.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    if (!created.success) throw new Error("setup failed");

    const edited = editTransactionCore(db, {
      transactionId: created.data.id,
      memberId: member.id,
      date: "2026-08-16",
      description: "Groceries (corrected)",
      postings: [
        { accountId: food.id, debit: 2500, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2500 },
      ],
    });

    expect(edited.success).toBe(true);
  });

  it("hard-deletes a transaction", () => {
    const db = createTestDb();
    const { member, bank, food } = setUp(db);
    const created = createTransactionCore(db, {
      memberId: member.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    if (!created.success) throw new Error("setup failed");

    const result = deleteTransactionCore(db, {
      transactionId: created.data.id,
      memberId: member.id,
    });

    expect(result.success).toBe(true);
  });
});
