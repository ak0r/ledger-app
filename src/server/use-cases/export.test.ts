import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import { createTransaction } from "./transactions";
import { exportTransactionsCsv } from "./export";

function setUp(db: ReturnType<typeof createTestDb>) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const bank = createAccount(db, {
    profileId: profile.id,
    currencyId: currency.id,
    name: "HDFC Bank",
    classification: "ASSET",
    instrumentType: "BANK",
  });
  const food = createAccount(db, {
    profileId: profile.id,
    currencyId: currency.id,
    name: "Food",
    classification: "EXPENSE",
    instrumentType: "EXPENSE",
  });
  return { profile, currency, bank, food };
}

describe("exportTransactionsCsv", () => {
  it("returns just the header row when there are no Transactions", () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const csv = exportTransactionsCsv(db, profile.id);

    expect(csv).toBe("Date,Description,Account,Direction,Amount,Currency,Tags");
  });

  it("writes one row per Posting, with human-readable decimal amounts", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    createTransaction(db, {
      profileId: profile.id,
      date: "2026-01-15",
      description: "Lunch",
      tags: ["work"],
      postings: [
        { accountId: food.id, debit: 25000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 25000 },
      ],
    });

    const csv = exportTransactionsCsv(db, profile.id);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe("Date,Description,Account,Direction,Amount,Currency,Tags");
    expect(lines).toContain("2026-01-15,Lunch,Food,Debit,250.00,INR,work");
    expect(lines).toContain("2026-01-15,Lunch,HDFC Bank,Credit,250.00,INR,work");
  });

  it("quotes a field containing a comma", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    createTransaction(db, {
      profileId: profile.id,
      date: "2026-01-15",
      description: "Lunch, with a friend",
      postings: [
        { accountId: food.id, debit: 1000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 1000 },
      ],
    });

    const csv = exportTransactionsCsv(db, profile.id);

    expect(csv).toContain('"Lunch, with a friend"');
  });

  it("only exports the given Profile's Transactions (rule #6)", () => {
    const db = createTestDb();
    const { profile, bank, food } = setUp(db);
    const other = createProfile(db, { name: "Partner" });
    createTransaction(db, {
      profileId: profile.id,
      date: "2026-01-15",
      description: "Lunch",
      postings: [
        { accountId: food.id, debit: 1000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 1000 },
      ],
    });

    const csv = exportTransactionsCsv(db, other.id);

    expect(csv).toBe("Date,Description,Account,Direction,Amount,Currency,Tags");
  });
});
