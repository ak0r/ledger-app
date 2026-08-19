import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createMember } from "./members";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import { createTransaction } from "./transactions";
import { getAccountRangeSummary, getBalanceTrend, getMonthlyCashflow } from "./accountHistory";
import { NotFoundError } from "./errors";

function setUp(db: ReturnType<typeof createTestDb>) {
  const member = createMember(db, { name: "Amit" });
  const currency = createCurrency(db, {
    memberId: member.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const bank = createAccount(db, {
    memberId: member.id,
    currencyId: currency.id,
    name: "Bank",
    classification: "ASSET",
    instrumentType: "BANK",
  });
  const salary = createAccount(db, {
    memberId: member.id,
    currencyId: currency.id,
    name: "Salary",
    classification: "INCOME",
    instrumentType: "INCOME",
  });
  const food = createAccount(db, {
    memberId: member.id,
    currencyId: currency.id,
    name: "Food",
    classification: "EXPENSE",
    instrumentType: "EXPENSE",
  });
  return { member, bank, salary, food };
}

describe("getBalanceTrend", () => {
  it("accumulates a running balance in chronological order, in the account's own normal-balance direction", () => {
    const db = createTestDb();
    const { member, bank, salary, food } = setUp(db);

    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Salary",
      postings: [
        { accountId: salary.id, debit: 0, credit: 100000 },
        { accountId: bank.id, debit: 100000, credit: 0 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-10",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(getBalanceTrend(db, member.id, bank.id)).toEqual([
      { date: "2026-01-05", balance: 100000 },
      { date: "2026-01-10", balance: 98000 },
    ]);
  });

  it("collapses same-day transactions into one point", () => {
    const db = createTestDb();
    const { member, bank, salary } = setUp(db);

    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Salary",
      postings: [
        { accountId: salary.id, debit: 0, credit: 50000 },
        { accountId: bank.id, debit: 50000, credit: 0 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Bonus",
      postings: [
        { accountId: salary.id, debit: 0, credit: 10000 },
        { accountId: bank.id, debit: 10000, credit: 0 },
      ],
    });

    expect(getBalanceTrend(db, member.id, bank.id)).toEqual([{ date: "2026-01-05", balance: 60000 }]);
  });

  it("throws NotFoundError for an unknown account", () => {
    const db = createTestDb();
    const { member } = setUp(db);
    expect(() => getBalanceTrend(db, member.id, "does-not-exist")).toThrow(NotFoundError);
  });
});

describe("getMonthlyCashflow", () => {
  it("groups inflow/outflow by month, relative to the account's own balance", () => {
    const db = createTestDb();
    const { member, bank, salary, food } = setUp(db);

    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Salary",
      postings: [
        { accountId: salary.id, debit: 0, credit: 100000 },
        { accountId: bank.id, debit: 100000, credit: 0 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-02-10",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(getMonthlyCashflow(db, member.id, bank.id)).toEqual([
      { month: "2026-01", inflow: 100000, outflow: 0 },
      { month: "2026-02", inflow: 0, outflow: 2000 },
    ]);
  });

  it("restricts to a date range, dropping months outside it", () => {
    const db = createTestDb();
    const { member, bank, salary, food } = setUp(db);

    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Salary",
      postings: [
        { accountId: salary.id, debit: 0, credit: 100000 },
        { accountId: bank.id, debit: 100000, credit: 0 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-02-10",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    expect(getMonthlyCashflow(db, member.id, bank.id, { from: "2026-02-01" })).toEqual([
      { month: "2026-02", inflow: 0, outflow: 2000 },
    ]);
  });
});

describe("getBalanceTrend with a date range", () => {
  it("starts from the real opening balance as of range.from, not zero", () => {
    const db = createTestDb();
    const { member, bank, salary, food } = setUp(db);

    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Salary",
      postings: [
        { accountId: salary.id, debit: 0, credit: 100000 },
        { accountId: bank.id, debit: 100000, credit: 0 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-02-10",
      description: "Groceries",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });

    // The window opens after the January salary — the single visible point
    // must still reflect that 100000 already happened, not restart at 0.
    expect(getBalanceTrend(db, member.id, bank.id, { from: "2026-02-01" })).toEqual([
      { date: "2026-02-10", balance: 98000 },
    ]);
  });

  it("excludes points after range.to", () => {
    const db = createTestDb();
    const { member, bank, salary } = setUp(db);

    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Salary",
      postings: [
        { accountId: salary.id, debit: 0, credit: 50000 },
        { accountId: bank.id, debit: 50000, credit: 0 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-03-01",
      description: "Bonus",
      postings: [
        { accountId: salary.id, debit: 0, credit: 20000 },
        { accountId: bank.id, debit: 20000, credit: 0 },
      ],
    });

    expect(getBalanceTrend(db, member.id, bank.id, { to: "2026-02-01" })).toEqual([
      { date: "2026-01-05", balance: 50000 },
    ]);
  });
});

describe("getAccountRangeSummary", () => {
  it("computes opening/closing balance and totals for the range, opening balance aware of prior history", () => {
    const db = createTestDb();
    const { member, bank, salary, food } = setUp(db);

    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Salary (before window)",
      postings: [
        { accountId: salary.id, debit: 0, credit: 100000 },
        { accountId: bank.id, debit: 100000, credit: 0 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-02-10",
      description: "Groceries (in window)",
      postings: [
        { accountId: food.id, debit: 2000, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 2000 },
      ],
    });
    createTransaction(db, {
      memberId: member.id,
      date: "2026-02-15",
      description: "Bonus (in window)",
      postings: [
        { accountId: salary.id, debit: 0, credit: 5000 },
        { accountId: bank.id, debit: 5000, credit: 0 },
      ],
    });

    const summary = getAccountRangeSummary(db, member.id, bank.id, { from: "2026-02-01" });
    expect(summary).toEqual({
      openingBalance: 100000,
      closingBalance: 103000,
      netChange: 3000,
      totalInflow: 5000,
      totalOutflow: 2000,
    });
  });

  it("with no range, opening balance is zero and closing balance is the all-time balance", () => {
    const db = createTestDb();
    const { member, bank, salary } = setUp(db);

    createTransaction(db, {
      memberId: member.id,
      date: "2026-01-05",
      description: "Salary",
      postings: [
        { accountId: salary.id, debit: 0, credit: 100000 },
        { accountId: bank.id, debit: 100000, credit: 0 },
      ],
    });

    const summary = getAccountRangeSummary(db, member.id, bank.id);
    expect(summary.openingBalance).toBe(0);
    expect(summary.closingBalance).toBe(100000);
  });
});
