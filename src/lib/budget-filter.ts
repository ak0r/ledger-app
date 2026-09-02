import {
  BUDGET_FILTER_MATCHES,
  type BudgetDateOperator,
  type BudgetDescriptionOperator,
  type BudgetExpenseAccountOperator,
  type BudgetFilterCondition,
  type BudgetFilterState,
  type BudgetTagsOperator,
} from "@/domain";

export type { BudgetFilterState } from "@/domain";
import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/use-cases/transactions";

// Evaluator for the Budget-domain filter shape (domain/budget.ts) against
// real ledger data — kept a separate file from that pure domain module
// (which must not depend on repository types), same split as
// src/lib/transaction-filter.ts / TransactionFilterState. Deliberately not
// the same type as TransactionFilterState (spec §7): Budget filters only
// ever see expense-classified legs of a transaction, and add a NONE match
// mode the Transaction List filter doesn't have.
function getExpenseAccountIds(
  transaction: TransactionWithPostings,
  accountsById: ReadonlyMap<string, AccountRow>,
): string[] {
  return transaction.postings
    .filter((posting) => posting.debit > 0 && accountsById.get(posting.accountId)?.classification === "EXPENSE")
    .map((posting) => posting.accountId);
}

function matchesExpenseAccount(
  expenseAccountIds: string[],
  operator: BudgetExpenseAccountOperator,
  value: unknown,
): boolean {
  switch (operator) {
    case "is":
      return expenseAccountIds.includes(value as string);
    case "is-not":
      return !expenseAccountIds.includes(value as string);
  }
}

function matchesDate(date: string, operator: BudgetDateOperator, value: unknown): boolean {
  switch (operator) {
    case "before":
      return date < (value as string);
    case "after":
      return date > (value as string);
    case "between": {
      const [from, to] = value as [string, string];
      return date >= from && date <= to;
    }
  }
}

function matchesTags(tags: string[] | null, operator: BudgetTagsOperator, value: unknown): boolean {
  const list = tags ?? [];
  switch (operator) {
    case "contains":
      return list.includes(value as string);
    case "not-contains":
      return !list.includes(value as string);
  }
}

function matchesDescription(description: string, operator: BudgetDescriptionOperator, value: unknown): boolean {
  const needle = String(value ?? "").toLowerCase();
  const haystack = description.toLowerCase();
  switch (operator) {
    case "contains":
      return haystack.includes(needle);
    case "is":
      return haystack === needle;
    case "is-not":
      return haystack !== needle;
  }
}

function evaluateCondition(
  transaction: TransactionWithPostings,
  accountsById: ReadonlyMap<string, AccountRow>,
  condition: BudgetFilterCondition,
): boolean {
  switch (condition.field) {
    case "expenseAccount":
      return matchesExpenseAccount(
        getExpenseAccountIds(transaction, accountsById),
        condition.operator as BudgetExpenseAccountOperator,
        condition.value,
      );
    case "date":
      return matchesDate(transaction.date, condition.operator as BudgetDateOperator, condition.value);
    case "tags":
      return matchesTags(transaction.tags, condition.operator as BudgetTagsOperator, condition.value);
    case "description":
      return matchesDescription(transaction.description, condition.operator as BudgetDescriptionOperator, condition.value);
  }
}

export function matchesBudgetFilter(
  transaction: TransactionWithPostings,
  accountsById: ReadonlyMap<string, AccountRow>,
  state: BudgetFilterState,
): boolean {
  if (state.conditions.length === 0) return true;
  const results = state.conditions.map((condition) => evaluateCondition(transaction, accountsById, condition));
  switch (state.match) {
    case "ALL":
      return results.every(Boolean);
    case "ANY":
      return results.some(Boolean);
    case "NONE":
      return !results.some(Boolean);
  }
}

export function filterTransactionsForBudget(
  transactions: readonly TransactionWithPostings[],
  accountsById: ReadonlyMap<string, AccountRow>,
  state: BudgetFilterState,
): TransactionWithPostings[] {
  return transactions.filter((transaction) => matchesBudgetFilter(transaction, accountsById, state));
}

// Expense accounts a filter matches at least one transaction against —
// spec §6's "effective account set" is Explicit Accounts UNION accounts
// derived from matching transactions; this produces the second half.
export function derivedExpenseAccountIds(
  transactions: readonly TransactionWithPostings[],
  accountsById: ReadonlyMap<string, AccountRow>,
  state: BudgetFilterState,
): Set<string> {
  const ids = new Set<string>();
  for (const transaction of transactions) {
    if (!matchesBudgetFilter(transaction, accountsById, state)) continue;
    for (const accountId of getExpenseAccountIds(transaction, accountsById)) ids.add(accountId);
  }
  return ids;
}

export function serializeBudgetFilter(state: BudgetFilterState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function parseBudgetFilter(raw: string | undefined): BudgetFilterState {
  if (!raw) return { match: "ALL", conditions: [] };
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (
      parsed &&
      BUDGET_FILTER_MATCHES.includes(parsed.match) &&
      Array.isArray(parsed.conditions)
    ) {
      return parsed as BudgetFilterState;
    }
    return { match: "ALL", conditions: [] };
  } catch {
    return { match: "ALL", conditions: [] };
  }
}
