import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "../services/profiles";
import { createCurrency } from "../services/currencies";
import { createAccount } from "../services/accounts";
import {
  createTransactionCore,
  deleteTransactionCore,
  editTransactionCore,
} from "./transactions.core";

function setUp(db: Db) {
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
  };
}

describe("createTransactionCore", () => {
  it("creates a balanced transaction", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);

    const result = createTransactionCore(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unbalanced 2-posting transaction (caught by the domain layer, not Zod — see next test)", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);

    const result = createTransactionCore(db, {
      profileId: profile.id,
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

  it("rejects an unbalanced split (3+ postings) at the Zod boundary — fast feedback", () => {
    // Zod's isBalanced only exempts the exactly-2-postings/one-debit/one-
    // credit shape (a possible Currency Conversion — schemas.ts can't see
    // Account currencies to confirm it, only the domain layer can, rule
    // #17). A 3-posting mismatch is never a Conversion candidate, so this
    // one genuinely still gets the fast, schema-layer rejection.
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);

    const result = createTransactionCore(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Broken split",
      postings: [
        { accountId: food.id, debit: 1000, credit: 0 },
        { accountId: food.id, debit: 1000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 1900 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/Postings must balance/);
  });

  it("passes a Currency Conversion payload through the Zod boundary based on an explicit rate, not raw-sum shape-guessing", () => {
    const db = createTestDb();
    const { profile, bank } = setUp(db);
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

    const result = createTransactionCore(db, {
      profileId: profile.id,
      date: "2026-09-03",
      description: "Convert Cash",
      postings: [
        { accountId: bank.id, debit: 0, credit: 1000000 },
        { accountId: jpyCash.id, debit: 15000, credit: 0, rateDecimal: 10000 / 15000 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a Currency Conversion payload with no explicit rate and a raw-mismatched sum at the Zod boundary", () => {
    // Transaction Form FX UX delta: the old "2 postings, 1 debit + 1
    // credit" shape-sniffing heuristic (which used to defer to the domain
    // layer for *any* 2-leg payload, balanced or not) is retired — a
    // client must explicitly signal "this leg is priced against a
    // different currency" via `rateDecimal`, not rely on Zod guessing
    // intent from shape alone.
    const db = createTestDb();
    const { profile, bank } = setUp(db);
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

    const result = createTransactionCore(db, {
      profileId: profile.id,
      date: "2026-09-03",
      description: "Convert Cash",
      postings: [
        { accountId: bank.id, debit: 0, credit: 1000000 },
        { accountId: jpyCash.id, debit: 15000, credit: 0 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/Postings must balance/);
  });

  it("rejects a posting to another Profile's account — only the domain layer can catch this", () => {
    const db = createTestDb();
    const { profile, food } = setUp(db);
    const otherLedger = setUp(db);

    const result = createTransactionCore(db, {
      profileId: profile.id,
      date: "2026-08-15",
      description: "Cross-profile write attempt",
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
    const { profile, bank, food } = setUp(db);
    const created = createTransactionCore(db, {
      profileId: profile.id,
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
      profileId: profile.id,
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
    const { profile, bank, food } = setUp(db);
    const created = createTransactionCore(db, {
      profileId: profile.id,
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
      profileId: profile.id,
    });

    expect(result.success).toBe(true);
  });
});
