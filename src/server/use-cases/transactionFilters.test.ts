import { describe, expect, it } from "vitest";
import type { AccountRow } from "../repositories/accounts";
import { filterTransactions, type TransactionWithPostings } from "./transactions";

// Full operator/ANY/ALL coverage lives in src/lib/transaction-filter.test.ts
// (matchesFilter itself, which this use-case wrapper delegates to). This
// file just confirms the wrapper is wired correctly end to end.

function account(id: string, classification: string): AccountRow {
  return {
    id,
    profileId: "profile-1",
    currencyId: "currency-1",
    name: id,
    classification: classification as never,
    instrumentType: "BANK",
    instrumentId: null,
    instrumentLabel: null,
    tags: null,
    icon: null,
    isArchived: false,
    metadata: null,
    createdAt: "now",
    updatedAt: "now",
  };
}

function transaction(
  id: string,
  date: string,
  postings: { accountId: string; debit: number; credit: number }[],
  tags: string[] | null = null,
): TransactionWithPostings {
  return {
    id,
    profileId: "profile-1",
    date,
    description: id,
    tags,
    createdAt: "now",
    updatedAt: "now",
    postings: postings.map((posting, index) => ({
      id: `${id}-p${index}`,
      transactionId: id,
      createdAt: "now",
      updatedAt: "now",
      ...posting,
    })),
  };
}

const bank = account("bank", "ASSET");
const food = account("food", "EXPENSE");
const salary = account("salary", "INCOME");
const accountsById = new Map([
  [bank.id, bank],
  [food.id, food],
  [salary.id, salary],
]);

const groceries = transaction(
  "t1",
  "2026-08-15",
  [
    { accountId: food.id, debit: 2000, credit: 0 },
    { accountId: bank.id, debit: 0, credit: 2000 },
  ],
  ["Japan2026"],
);
const paycheck = transaction("t2", "2026-08-01", [
  { accountId: bank.id, debit: 100000, credit: 0 },
  { accountId: salary.id, debit: 0, credit: 100000 },
]);

describe("filterTransactions (use-case wrapper)", () => {
  it("returns everything for an empty filter state", () => {
    expect(
      filterTransactions([groceries, paycheck], accountsById, { match: "ALL", conditions: [] }),
    ).toHaveLength(2);
  });

  it("applies a single condition", () => {
    const result = filterTransactions([groceries, paycheck], accountsById, {
      match: "ALL",
      conditions: [{ id: "1", field: "toAccount", operator: "is", value: food.id }],
    });
    expect(result).toEqual([groceries]);
  });

  it("combines conditions with ALL", () => {
    const result = filterTransactions([groceries, paycheck], accountsById, {
      match: "ALL",
      conditions: [
        { id: "1", field: "fromAccount", operator: "is", value: bank.id },
        { id: "2", field: "tags", operator: "contains", value: "Japan2026" },
      ],
    });
    expect(result).toEqual([groceries]);
  });
});
