import type { AccountWithBalance } from "@/server/services/accounts";
import {
  compareNumbers,
  compareStrings,
  compareTagKeys,
  nextSortState,
  parseSortStateFor,
  tagSortKey,
  type SortState,
} from "./transaction-sort";

// Accounts table's own sort — same URL-driven three-state machine as
// Transactions (transaction-sort.ts's now-generic parse/cycle/href-build
// primitives, reused rather than re-derived), applied to the full account
// list before render (19 accounts in the demo family — no pagination on
// this list, so there's no separate "sort before slicing" concern the way
// Transactions has). "Default" (`sortState === null`) is
// `findAccountsByMember`'s own DB order (creation order), untouched.
export type AccountSortField = "name" | "classification" | "instrumentType" | "balance" | "tags";

const ACCOUNT_SORT_FIELDS: readonly AccountSortField[] = [
  "name",
  "classification",
  "instrumentType",
  "balance",
  "tags",
];

export type AccountSortState = SortState<AccountSortField>;

export function parseAccountSortState(
  field: string | undefined,
  direction: string | undefined,
): AccountSortState | null {
  return parseSortStateFor(ACCOUNT_SORT_FIELDS, field, direction);
}

export function nextAccountSortState(
  current: AccountSortState | null,
  field: AccountSortField,
): AccountSortState | null {
  return nextSortState(current, field);
}

// Unlike transaction-sort.ts's `buildSortHref` (which preserves exactly two
// optional single-value params, `filter`/`pageSize`), Accounts' filter is
// three separate params (`classification`/`instrument`/`q` — see
// account-filter.ts) with no pagination at all — simplest to just accept
// the caller's already-built preserve-params record directly (typically
// `accountFilterToParams(filterState)`) rather than force a mismatched
// shape onto the shared helper.
export function buildAccountSortHref(
  baseHref: string,
  preserveParams: Record<string, string>,
  next: AccountSortState | null,
): string {
  const params = new URLSearchParams(preserveParams);
  if (next) {
    params.set("sort", next.field);
    params.set("dir", next.direction);
  } else {
    params.delete("sort");
    params.delete("dir");
  }
  const query = params.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

function compareAccounts(
  a: AccountWithBalance,
  b: AccountWithBalance,
  { field, direction }: AccountSortState,
): number {
  switch (field) {
    case "name":
      return compareStrings(a.name, b.name, direction);
    case "classification":
      return compareStrings(a.classification, b.classification, direction);
    case "instrumentType":
      return compareStrings(a.instrumentType, b.instrumentType, direction);
    case "balance":
      return compareNumbers(a.balance, b.balance, direction);
    case "tags":
      return compareTagKeys(tagSortKey(a.tags), tagSortKey(b.tags), direction);
  }
}

export function applyAccountSort(
  accounts: readonly AccountWithBalance[],
  sortState: AccountSortState | null,
): AccountWithBalance[] {
  if (!sortState) return [...accounts];
  return [...accounts].sort((a, b) => compareAccounts(a, b, sortState));
}
