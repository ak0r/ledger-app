import { describe, expect, it } from "vitest";
import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/services/transactions";
import {
  derivedExpenseAccountIds,
  filterTransactionsForBudget,
  matchesBudgetFilter,
  parseBudgetFilter,
  serializeBudgetFilter,
  type BudgetFilterState,
} from "./budget-filter";

function account(id: string, classification: string): AccountRow {
  return {
    id,
    profileId: "profile-1",
    currencyId: "currency-1",
    name: id,
    classification: classification as never,
    accountType: "BANK",
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
  description: string,
  postings: { accountId: string; debit: number; credit: number }[],
  tags: string[] | null = null,
): TransactionWithPostings {
  return {
    id,
    profileId: "profile-1",
    date,
    description,
    tags,
    importFileId: null,
    createdAt: "now",
    updatedAt: "now",
    postings: postings.map((posting, index) => ({
      id: `${id}-p${index}`,
      transactionId: id,
      accountId: posting.accountId,
      units: posting.debit - posting.credit,
      priceNum: 1,
      priceDenom: 1,
      baseAmount: posting.debit - posting.credit,
      createdAt: "now",
      updatedAt: "now",
    })),
  };
}

const accountsById = new Map<string, AccountRow>(
  [account("bank", "ASSET"), account("food", "EXPENSE"), account("travel", "EXPENSE"), account("salary", "INCOME")].map(
    (a) => [a.id, a],
  ),
);

const foodTxn = transaction(
  "t1",
  "2026-09-05",
  "Groceries",
  [
    { accountId: "bank", debit: 0, credit: 5000 },
    { accountId: "food", debit: 5000, credit: 0 },
  ],
  ["weekly"],
);

const travelTxn = transaction(
  "t2",
  "2026-09-10",
  "Flight to Japan",
  [
    { accountId: "bank", debit: 0, credit: 90000 },
    { accountId: "travel", debit: 90000, credit: 0 },
  ],
  ["japan2026"],
);

// Transfer between two non-expense accounts — must never match any Budget
// filter, since Budgets are expense-only (spec §14) and expenseAccount
// resolution only ever looks at EXPENSE-classified legs.
const transferTxn = transaction("t3", "2026-09-12", "Move to savings", [
  { accountId: "bank", debit: 0, credit: 20000 },
  { accountId: "salary", debit: 20000, credit: 0 },
]);

describe("matchesBudgetFilter", () => {
  it("matches empty conditions against everything", () => {
    expect(matchesBudgetFilter(foodTxn, accountsById, { match: "ALL", conditions: [] })).toBe(true);
  });

  it("matches expenseAccount is", () => {
    const state: BudgetFilterState = {
      match: "ALL",
      conditions: [{ id: "1", field: "expenseAccount", operator: "is", value: "food" }],
    };
    expect(matchesBudgetFilter(foodTxn, accountsById, state)).toBe(true);
    expect(matchesBudgetFilter(travelTxn, accountsById, state)).toBe(false);
  });

  it("an expenseAccount 'is' condition never matches a transaction with no expense-classified leg", () => {
    const state: BudgetFilterState = {
      match: "ALL",
      conditions: [{ id: "1", field: "expenseAccount", operator: "is", value: "food" }],
    };
    expect(matchesBudgetFilter(transferTxn, accountsById, state)).toBe(false);
  });

  it("ANY matches if at least one condition matches", () => {
    const state: BudgetFilterState = {
      match: "ANY",
      conditions: [
        { id: "1", field: "expenseAccount", operator: "is", value: "food" },
        { id: "2", field: "tags", operator: "contains", value: "japan2026" },
      ],
    };
    expect(matchesBudgetFilter(foodTxn, accountsById, state)).toBe(true);
    expect(matchesBudgetFilter(travelTxn, accountsById, state)).toBe(true);
    expect(matchesBudgetFilter(transferTxn, accountsById, state)).toBe(false);
  });

  it("NONE matches only when no condition matches", () => {
    const state: BudgetFilterState = {
      match: "NONE",
      conditions: [{ id: "1", field: "expenseAccount", operator: "is", value: "food" }],
    };
    expect(matchesBudgetFilter(foodTxn, accountsById, state)).toBe(false);
    expect(matchesBudgetFilter(travelTxn, accountsById, state)).toBe(true);
  });

  it("matches date between", () => {
    const state: BudgetFilterState = {
      match: "ALL",
      conditions: [{ id: "1", field: "date", operator: "between", value: ["2026-09-01", "2026-09-07"] }],
    };
    expect(matchesBudgetFilter(foodTxn, accountsById, state)).toBe(true);
    expect(matchesBudgetFilter(travelTxn, accountsById, state)).toBe(false);
  });

  it("matches description contains", () => {
    const state: BudgetFilterState = {
      match: "ALL",
      conditions: [{ id: "1", field: "description", operator: "contains", value: "japan" }],
    };
    expect(matchesBudgetFilter(travelTxn, accountsById, state)).toBe(true);
    expect(matchesBudgetFilter(foodTxn, accountsById, state)).toBe(false);
  });
});

describe("filterTransactionsForBudget / derivedExpenseAccountIds", () => {
  const state: BudgetFilterState = {
    match: "ALL",
    conditions: [{ id: "1", field: "tags", operator: "contains", value: "japan2026" }],
  };

  it("filters to matching transactions", () => {
    expect(filterTransactionsForBudget([foodTxn, travelTxn, transferTxn], accountsById, state)).toEqual([travelTxn]);
  });

  it("derives the expense accounts touched by matching transactions", () => {
    expect(derivedExpenseAccountIds([foodTxn, travelTxn, transferTxn], accountsById, state)).toEqual(
      new Set(["travel"]),
    );
  });
});

describe("serializeBudgetFilter / parseBudgetFilter", () => {
  it("round-trips through a URL-safe string", () => {
    const state: BudgetFilterState = {
      match: "ANY",
      conditions: [{ id: "1", field: "expenseAccount", operator: "is", value: "food" }],
    };
    expect(parseBudgetFilter(serializeBudgetFilter(state))).toEqual(state);
  });

  it("falls back to an empty ALL state for garbage input", () => {
    expect(parseBudgetFilter("not json")).toEqual({ match: "ALL", conditions: [] });
    expect(parseBudgetFilter(undefined)).toEqual({ match: "ALL", conditions: [] });
  });
});
