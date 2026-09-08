import { describe, expect, it } from "vitest";
import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/services/transactions";
import {
  EMPTY_FILTER_STATE,
  filterTransactions,
  matchesFilter,
  parseTransactionFilter,
  serializeTransactionFilter,
  type FilterCondition,
  type TransactionFilterState,
} from "./transaction-filter";

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

const bank = account("bank", "ASSET");
const food = account("food", "EXPENSE");
const misc = account("misc", "EXPENSE");
const salary = account("salary", "INCOME");
const accountsById = new Map([
  [bank.id, bank],
  [food.id, food],
  [misc.id, misc],
  [salary.id, salary],
]);

const groceries = transaction(
  "t1",
  "2026-08-15",
  "Groceries run",
  [
    { accountId: food.id, debit: 2000, credit: 0 },
    { accountId: bank.id, debit: 0, credit: 2000 },
  ],
  ["Japan2026"],
);
const paycheck = transaction("t2", "2026-08-01", "Paycheck", [
  { accountId: bank.id, debit: 100000, credit: 0 },
  { accountId: salary.id, debit: 0, credit: 100000 },
]);
const splitShopping = transaction(
  "t3",
  "2026-08-10",
  "Split shopping",
  [
    { accountId: bank.id, debit: 0, credit: 5000 },
    { accountId: food.id, debit: 3000, credit: 0 },
    { accountId: misc.id, debit: 2000, credit: 0 },
  ],
  ["Japan2026", "Home"],
);

const all = [groceries, paycheck, splitShopping];

function cond(field: FilterCondition["field"], operator: FilterCondition["operator"], value?: FilterCondition["value"]): FilterCondition {
  return { id: field + "-" + operator, field, operator, value };
}

function stateOf(conditions: FilterCondition[], match: "ALL" | "ANY" = "ALL"): TransactionFilterState {
  return { match, conditions };
}

describe("filterTransactions / matchesFilter", () => {
  it("returns everything when there are no conditions", () => {
    expect(filterTransactions(all, accountsById, EMPTY_FILTER_STATE)).toEqual(all);
  });

  describe("description", () => {
    it("contains", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("description", "contains", "shop")]))).toEqual([
        splitShopping,
      ]);
    });
    it("not-contains", () => {
      expect(
        filterTransactions(all, accountsById, stateOf([cond("description", "not-contains", "shop")])),
      ).toEqual([groceries, paycheck]);
    });
    it("is / is-not", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("description", "is", "Paycheck")]))).toEqual([
        paycheck,
      ]);
      expect(
        filterTransactions(all, accountsById, stateOf([cond("description", "is-not", "Paycheck")])),
      ).toEqual([groceries, splitShopping]);
    });
    it("starts-with / ends-with", () => {
      expect(
        filterTransactions(all, accountsById, stateOf([cond("description", "starts-with", "Groc")])),
      ).toEqual([groceries]);
      expect(
        filterTransactions(all, accountsById, stateOf([cond("description", "ends-with", "shopping")])),
      ).toEqual([splitShopping]);
    });
  });

  describe("fromAccount", () => {
    it("is / is-not", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("fromAccount", "is", bank.id)]))).toEqual([
        groceries,
        splitShopping,
      ]);
      expect(
        filterTransactions(all, accountsById, stateOf([cond("fromAccount", "is-not", bank.id)])),
      ).toEqual([paycheck]);
    });
    it("in / not-in", () => {
      expect(
        filterTransactions(all, accountsById, stateOf([cond("fromAccount", "in", [bank.id, salary.id])])),
      ).toEqual(all);
      expect(
        filterTransactions(all, accountsById, stateOf([cond("fromAccount", "not-in", [bank.id])])),
      ).toEqual([paycheck]);
    });
  });

  describe("toAccount (split-aware)", () => {
    it("is matches any destination posting", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("toAccount", "is", misc.id)]))).toEqual([
        splitShopping,
      ]);
    });
    it("is-not excludes any transaction touching that destination", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("toAccount", "is-not", food.id)]))).toEqual([
        paycheck,
      ]);
    });
    it("in / not-in", () => {
      expect(
        filterTransactions(all, accountsById, stateOf([cond("toAccount", "in", [misc.id])])),
      ).toEqual([splitShopping]);
      // paycheck's only destination is bank, so it's the one excluded from [food, misc]
      expect(
        filterTransactions(all, accountsById, stateOf([cond("toAccount", "not-in", [food.id, misc.id])])),
      ).toEqual([paycheck]);
    });
  });

  describe("amount", () => {
    it("eq / neq", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("amount", "eq", 2000)]))).toEqual([
        groceries,
      ]);
      expect(filterTransactions(all, accountsById, stateOf([cond("amount", "neq", 2000)]))).toEqual([
        paycheck,
        splitShopping,
      ]);
    });
    it("gt / gte / lt / lte", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("amount", "gt", 5000)]))).toEqual([
        paycheck,
      ]);
      expect(filterTransactions(all, accountsById, stateOf([cond("amount", "gte", 5000)]))).toEqual([
        paycheck,
        splitShopping,
      ]);
      expect(filterTransactions(all, accountsById, stateOf([cond("amount", "lt", 5000)]))).toEqual([
        groceries,
      ]);
      expect(filterTransactions(all, accountsById, stateOf([cond("amount", "lte", 5000)]))).toEqual([
        groceries,
        splitShopping,
      ]);
    });
    it("between", () => {
      expect(
        filterTransactions(all, accountsById, stateOf([cond("amount", "between", [1000, 5000])])),
      ).toEqual([groceries, splitShopping]);
    });
  });

  describe("date", () => {
    const now = new Date("2026-08-16T12:00:00Z");

    it("is / before / after", () => {
      expect(matchesFilter(groceries, accountsById, stateOf([cond("date", "is", "2026-08-15")]), now)).toBe(
        true,
      );
      expect(matchesFilter(paycheck, accountsById, stateOf([cond("date", "before", "2026-08-10")]), now)).toBe(
        true,
      );
      expect(matchesFilter(groceries, accountsById, stateOf([cond("date", "after", "2026-08-10")]), now)).toBe(
        true,
      );
    });
    it("between", () => {
      expect(
        matchesFilter(
          splitShopping,
          accountsById,
          stateOf([cond("date", "between", ["2026-08-05", "2026-08-12"])]),
          now,
        ),
      ).toBe(true);
    });
    it("today preset", () => {
      const todayTxn = transaction("t-today", "2026-08-16", "Today txn", [
        { accountId: food.id, debit: 100, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 100 },
      ]);
      expect(matchesFilter(todayTxn, accountsById, stateOf([cond("date", "today")]), now)).toBe(true);
      expect(matchesFilter(groceries, accountsById, stateOf([cond("date", "today")]), now)).toBe(false);
    });
    it("this-week preset (Monday-start)", () => {
      // now = Sun 2026-08-16 -> current week is Mon 2026-08-10..Sun 2026-08-16
      expect(matchesFilter(splitShopping, accountsById, stateOf([cond("date", "this-week")]), now)).toBe(
        true,
      );
      expect(matchesFilter(paycheck, accountsById, stateOf([cond("date", "this-week")]), now)).toBe(false);
    });
    it("this-month / last-month preset", () => {
      expect(matchesFilter(groceries, accountsById, stateOf([cond("date", "this-month")]), now)).toBe(true);
      const julTxn = transaction("t-jul", "2026-07-20", "July txn", [
        { accountId: food.id, debit: 100, credit: 0 },
        { accountId: bank.id, debit: 0, credit: 100 },
      ]);
      expect(matchesFilter(julTxn, accountsById, stateOf([cond("date", "last-month")]), now)).toBe(true);
      expect(matchesFilter(groceries, accountsById, stateOf([cond("date", "last-month")]), now)).toBe(false);
    });
  });

  describe("tags", () => {
    it("contains / not-contains", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("tags", "contains", "Home")]))).toEqual([
        splitShopping,
      ]);
      expect(
        filterTransactions(all, accountsById, stateOf([cond("tags", "not-contains", "Japan2026")])),
      ).toEqual([paycheck]);
    });
    it("has-any / has-all", () => {
      expect(
        filterTransactions(all, accountsById, stateOf([cond("tags", "has-any", ["Home", "Nope"])])),
      ).toEqual([splitShopping]);
      expect(
        filterTransactions(all, accountsById, stateOf([cond("tags", "has-all", ["Japan2026", "Home"])])),
      ).toEqual([splitShopping]);
    });
  });

  describe("isSplit", () => {
    it("is-split / is-not-split", () => {
      expect(filterTransactions(all, accountsById, stateOf([cond("isSplit", "is-split")]))).toEqual([
        splitShopping,
      ]);
      expect(filterTransactions(all, accountsById, stateOf([cond("isSplit", "is-not-split")]))).toEqual([
        groceries,
        paycheck,
      ]);
    });
  });

  describe("ANY vs ALL", () => {
    it("ALL requires every condition", () => {
      const state = stateOf(
        [cond("fromAccount", "is", bank.id), cond("amount", "gt", 3000)],
        "ALL",
      );
      expect(filterTransactions(all, accountsById, state)).toEqual([splitShopping]);
    });
    it("ANY requires just one condition", () => {
      const state = stateOf(
        [cond("description", "is", "Paycheck"), cond("tags", "contains", "Home")],
        "ANY",
      );
      expect(filterTransactions(all, accountsById, state)).toEqual([paycheck, splitShopping]);
    });
  });
});

describe("serialize/parseTransactionFilter", () => {
  it("round-trips a filter state", () => {
    const state = stateOf([cond("description", "contains", "shop")], "ANY");
    const raw = serializeTransactionFilter(state);
    expect(parseTransactionFilter(raw)).toEqual(state);
  });

  it("falls back to empty state for missing/invalid input", () => {
    expect(parseTransactionFilter(undefined)).toEqual(EMPTY_FILTER_STATE);
    expect(parseTransactionFilter("not-json")).toEqual(EMPTY_FILTER_STATE);
  });
});
