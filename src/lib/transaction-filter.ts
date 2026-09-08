import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/services/transactions";

// Generic, DB-independent condition-based filter model — replaces the old
// ad hoc flat `TransactionFilters` (docs/handoff plan). Reusable by the
// Member-level Transactions page, Account Detail's Transactions tab, and
// later Spaces/reports (all operate on already-fetched `TransactionWithPostings[]`,
// same as the model it replaces).
export type FilterField =
  | "description"
  | "fromAccount"
  | "toAccount"
  | "amount"
  | "date"
  | "tags"
  | "isSplit";

export type DescriptionOperator =
  | "contains"
  | "not-contains"
  | "is"
  | "is-not"
  | "starts-with"
  | "ends-with";
export type AccountOperator = "is" | "is-not" | "in" | "not-in";
export type AmountOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between";
export type DateOperator =
  | "is"
  | "before"
  | "after"
  | "between"
  | "today"
  | "this-week"
  | "this-month"
  | "last-month";
export type TagsOperator = "contains" | "not-contains" | "has-any" | "has-all";
export type IsSplitOperator = "is-split" | "is-not-split";

export type FilterOperator =
  | DescriptionOperator
  | AccountOperator
  | AmountOperator
  | DateOperator
  | TagsOperator
  | IsSplitOperator;

export interface FilterCondition {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  // Shape depends on field+operator: string for single-value text/account/date,
  // string[] for account in/not-in and tags has-any/has-all, number for a
  // single amount, [number, number] for amount "between", [string, string]
  // for date "between". Date presets (today/this-week/this-month/last-month)
  // and isSplit's two operators carry no value.
  value?: string | string[] | number | [number, number] | [string, string];
}

export interface TransactionFilterState {
  match: "ALL" | "ANY";
  conditions: FilterCondition[];
}

export const EMPTY_FILTER_STATE: TransactionFilterState = { match: "ALL", conditions: [] };

function getFromAccountId(transaction: TransactionWithPostings): string | undefined {
  return transaction.postings.find((posting) => posting.units < 0)?.accountId;
}

function getToAccountIds(transaction: TransactionWithPostings): string[] {
  return transaction.postings.filter((posting) => posting.units > 0).map((posting) => posting.accountId);
}

// The transaction's total — the credited amount, same figure the list
// already displays as "From Amount" (single credit posting, rule #15).
function getAmount(transaction: TransactionWithPostings): number {
  const from = transaction.postings.find((posting) => posting.units < 0);
  return from ? -from.units : 0;
}

function matchesDescription(
  transaction: TransactionWithPostings,
  operator: DescriptionOperator,
  value: unknown,
): boolean {
  const needle = String(value ?? "").toLowerCase();
  const haystack = transaction.description.toLowerCase();
  switch (operator) {
    case "contains":
      return haystack.includes(needle);
    case "not-contains":
      return !haystack.includes(needle);
    case "is":
      return haystack === needle;
    case "is-not":
      return haystack !== needle;
    case "starts-with":
      return haystack.startsWith(needle);
    case "ends-with":
      return haystack.endsWith(needle);
  }
}

function matchesAccount(
  accountId: string | undefined,
  operator: AccountOperator,
  value: unknown,
): boolean {
  switch (operator) {
    case "is":
      return accountId === value;
    case "is-not":
      return accountId !== value;
    case "in":
      return accountId !== undefined && (value as string[]).includes(accountId);
    case "not-in":
      return accountId === undefined || !(value as string[]).includes(accountId);
  }
}

// "To account" is split-aware (rule #15's 1→N model): matches if any
// destination posting matches.
function matchesToAccount(
  toAccountIds: string[],
  operator: AccountOperator,
  value: unknown,
): boolean {
  switch (operator) {
    case "is":
      return toAccountIds.includes(value as string);
    case "is-not":
      return !toAccountIds.includes(value as string);
    case "in":
      return toAccountIds.some((id) => (value as string[]).includes(id));
    case "not-in":
      return !toAccountIds.some((id) => (value as string[]).includes(id));
  }
}

function matchesAmount(amount: number, operator: AmountOperator, value: unknown): boolean {
  switch (operator) {
    case "eq":
      return amount === value;
    case "neq":
      return amount !== value;
    case "gt":
      return amount > (value as number);
    case "gte":
      return amount >= (value as number);
    case "lt":
      return amount < (value as number);
    case "lte":
      return amount <= (value as number);
    case "between": {
      const [min, max] = value as [number, number];
      return amount >= min && amount <= max;
    }
  }
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(now: Date): Date {
  const day = now.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return start;
}

function datePresetRange(operator: DateOperator, now: Date): [string, string] {
  switch (operator) {
    case "today":
      return [toDateKey(now), toDateKey(now)];
    case "this-week": {
      const start = startOfWeek(now);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return [toDateKey(start), toDateKey(end)];
    }
    case "this-month": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      return [toDateKey(start), toDateKey(end)];
    }
    case "last-month": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return [toDateKey(start), toDateKey(end)];
    }
    default:
      throw new Error(`${operator} is not a date preset`);
  }
}

function matchesDate(date: string, operator: DateOperator, value: unknown, now: Date): boolean {
  switch (operator) {
    case "is":
      return date === value;
    case "before":
      return date < (value as string);
    case "after":
      return date > (value as string);
    case "between": {
      const [from, to] = value as [string, string];
      return date >= from && date <= to;
    }
    case "today":
    case "this-week":
    case "this-month":
    case "last-month": {
      const [from, to] = datePresetRange(operator, now);
      return date >= from && date <= to;
    }
  }
}

function matchesTags(tags: string[] | null, operator: TagsOperator, value: unknown): boolean {
  const list = tags ?? [];
  switch (operator) {
    case "contains":
      return list.includes(value as string);
    case "not-contains":
      return !list.includes(value as string);
    case "has-any":
      return (value as string[]).some((tag) => list.includes(tag));
    case "has-all":
      return (value as string[]).every((tag) => list.includes(tag));
  }
}

function matchesIsSplit(toAccountIds: string[], operator: IsSplitOperator): boolean {
  const isSplit = toAccountIds.length > 1;
  return operator === "is-split" ? isSplit : !isSplit;
}

function evaluateCondition(
  transaction: TransactionWithPostings,
  condition: FilterCondition,
  now: Date,
): boolean {
  switch (condition.field) {
    case "description":
      return matchesDescription(transaction, condition.operator as DescriptionOperator, condition.value);
    case "fromAccount":
      return matchesAccount(getFromAccountId(transaction), condition.operator as AccountOperator, condition.value);
    case "toAccount":
      return matchesToAccount(getToAccountIds(transaction), condition.operator as AccountOperator, condition.value);
    case "amount":
      return matchesAmount(getAmount(transaction), condition.operator as AmountOperator, condition.value);
    case "date":
      return matchesDate(transaction.date, condition.operator as DateOperator, condition.value, now);
    case "tags":
      return matchesTags(transaction.tags, condition.operator as TagsOperator, condition.value);
    case "isSplit":
      return matchesIsSplit(getToAccountIds(transaction), condition.operator as IsSplitOperator);
  }
}

// `accountsById` isn't used by any condition evaluator directly today (all
// current fields resolve off the transaction/postings alone) but stays in
// the signature per the spec — future fields (e.g. classification) will
// need it, and every call site already has it on hand.
export function matchesFilter(
  transaction: TransactionWithPostings,
  accountsById: ReadonlyMap<string, AccountRow>,
  state: TransactionFilterState,
  now: Date = new Date(),
): boolean {
  void accountsById;
  if (state.conditions.length === 0) return true;
  return state.match === "ALL"
    ? state.conditions.every((condition) => evaluateCondition(transaction, condition, now))
    : state.conditions.some((condition) => evaluateCondition(transaction, condition, now));
}

export function filterTransactions(
  transactions: readonly TransactionWithPostings[],
  accountsById: ReadonlyMap<string, AccountRow>,
  state: TransactionFilterState,
): TransactionWithPostings[] {
  return transactions.filter((transaction) => matchesFilter(transaction, accountsById, state));
}

export function serializeTransactionFilter(state: TransactionFilterState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function parseTransactionFilter(raw: string | undefined): TransactionFilterState {
  if (!raw) return EMPTY_FILTER_STATE;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (
      parsed &&
      (parsed.match === "ALL" || parsed.match === "ANY") &&
      Array.isArray(parsed.conditions)
    ) {
      return parsed as TransactionFilterState;
    }
    return EMPTY_FILTER_STATE;
  } catch {
    return EMPTY_FILTER_STATE;
  }
}
