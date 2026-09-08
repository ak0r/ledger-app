import type { AccountRow } from "@/server/repositories/accounts";
import type { TransactionWithPostings } from "@/server/services/transactions";

// Single-column, three-state sort (default → ascending → descending →
// default) applied to the *entire* filtered result set before pagination —
// mirrors transaction-filter.ts's posture (pure, DB-independent, operates
// on already-fetched `TransactionWithPostings[]`) so it slots into the
// existing filter → sort → paginate pipeline both transaction list pages
// already run. "Default" (`sortState === null`) is simply not touching the
// array — `listTransactions`' own DB order (date descending) already is
// the desired default, this module only ever overrides it.
//
// A split/merged transaction is still one row for sorting purposes (never
// the individual postings) — `fromAmount`/`toAmount` sort by the
// transaction-level total (each side's postings summed), and
// `fromAccount`/`toAccount` sort by the *first* posting on that side, same
// account name already shown in the collapsed row's summary
// (transaction-table.tsx's `chevronSide`/badge logic) — sorting by what's
// actually on screen rather than an invisible tie-break.
export type SortField =
  | "date"
  | "description"
  | "tags"
  | "fromAccount"
  | "fromAmount"
  | "toAccount"
  | "toAmount";

export type SortDirection = "asc" | "desc";

// Generic over the field union — account-sort.ts reuses this exact same
// URL-driven three-state machine (parse/cycle/href-build) with its own
// field set, rather than re-deriving an identical state machine. Defaults
// to this module's own `SortField` so every existing call site here (typed
// `SortState | null`, no explicit type argument) keeps working unchanged.
export interface SortState<F extends string = SortField> {
  field: F;
  direction: SortDirection;
}

const SORT_FIELDS: readonly SortField[] = [
  "date",
  "description",
  "tags",
  "fromAccount",
  "fromAmount",
  "toAccount",
  "toAmount",
];

export function parseSortState(field: string | undefined, direction: string | undefined): SortState | null {
  return parseSortStateFor(SORT_FIELDS, field, direction);
}

// Generic parser — takes the caller's own allowed-fields list so
// account-sort.ts (and anything else) gets real validation without
// duplicating this function's body.
export function parseSortStateFor<F extends string>(
  allowedFields: readonly F[],
  field: string | undefined,
  direction: string | undefined,
): SortState<F> | null {
  if (!field || !direction) return null;
  if (!allowedFields.includes(field as F)) return null;
  if (direction !== "asc" && direction !== "desc") return null;
  return { field: field as F, direction };
}

// Clicking a column that isn't the current sort jumps straight to
// ascending (never inherits the previous column's direction — single-
// column sort only). Clicking the *active* column advances
// asc → desc → back to `null` (Default).
export function nextSortState<F extends string>(current: SortState<F> | null, field: F): SortState<F> | null {
  if (!current || current.field !== field) return { field, direction: "asc" };
  if (current.direction === "asc") return { field, direction: "desc" };
  return null;
}

// `preserve` carries the other query params a sort click must not clobber
// (`filter`, `pageSize`) — `page` is deliberately never preserved here:
// re-sorting changes which rows land on any given page, so every sort
// click jumps back to page 1 rather than risk stranding the user on a now
// out-of-range or just-different page of results.
export function buildSortHref<F extends string>(
  baseHref: string,
  preserve: { filter?: string; pageSize?: string },
  next: SortState<F> | null,
): string {
  const params = new URLSearchParams();
  if (preserve.filter) params.set("filter", preserve.filter);
  if (preserve.pageSize) params.set("pageSize", preserve.pageSize);
  if (next) {
    params.set("sort", next.field);
    params.set("dir", next.direction);
  }
  const query = params.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

function firstAccountName(
  transaction: TransactionWithPostings,
  accountsById: ReadonlyMap<string, AccountRow>,
  side: "from" | "to",
): string {
  const posting = transaction.postings.find((posting) => (side === "from" ? posting.units < 0 : posting.units > 0));
  return posting ? (accountsById.get(posting.accountId)?.name ?? "") : "";
}

function totalAmount(transaction: TransactionWithPostings, side: "from" | "to"): number {
  return transaction.postings.reduce(
    (sum, posting) => sum + (side === "from" ? Math.max(-posting.units, 0) : Math.max(posting.units, 0)),
    0,
  );
}

// Tags have no defined ordering (AGENTS.md rule #13: inline
// `Record<string,string>`, no global Tag entity) — sorting by "the tag"
// isn't a stored concept, so this picks the alphabetically-first
// `key:value` pair as a deterministic, reproducible stand-in. Untagged
// rows sort to the end regardless of direction (`compareTagKeys` below
// checks this *before* applying direction) rather than jumping to the top
// on `desc` — "no tags" isn't meaningfully "greater than" every real tag.
// Exported — account-sort.ts reuses this exact definition rather than
// re-deriving it, since Accounts' `tags` field is the identical
// `string[] | null` shape.
export function tagSortKey(tags: string[] | null): string | null {
  if (!tags || tags.length === 0) return null;
  return [...tags].sort((a, b) => a.localeCompare(b))[0];
}

// Exported alongside `tagSortKey` — account-sort.ts's comparators are the
// identical string/number/tag-key primitives, just applied to Account
// fields instead of Transaction ones.
export function compareStrings(a: string, b: string, direction: SortDirection): number {
  const cmp = a.localeCompare(b);
  return direction === "desc" ? -cmp : cmp;
}

export function compareNumbers(a: number, b: number, direction: SortDirection): number {
  const cmp = a - b;
  return direction === "desc" ? -cmp : cmp;
}

export function compareTagKeys(a: string | null, b: string | null, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareStrings(a, b, direction);
}

function compareTransactions(
  a: TransactionWithPostings,
  b: TransactionWithPostings,
  accountsById: ReadonlyMap<string, AccountRow>,
  sortState: SortState,
): number {
  const { field, direction } = sortState;
  switch (field) {
    case "date":
      return compareStrings(a.date, b.date, direction);
    case "description":
      return compareStrings(a.description, b.description, direction);
    case "tags":
      return compareTagKeys(tagSortKey(a.tags), tagSortKey(b.tags), direction);
    case "fromAccount":
      return compareStrings(
        firstAccountName(a, accountsById, "from"),
        firstAccountName(b, accountsById, "from"),
        direction,
      );
    case "toAccount":
      return compareStrings(
        firstAccountName(a, accountsById, "to"),
        firstAccountName(b, accountsById, "to"),
        direction,
      );
    case "fromAmount":
      return compareNumbers(totalAmount(a, "from"), totalAmount(b, "from"), direction);
    case "toAmount":
      return compareNumbers(totalAmount(a, "to"), totalAmount(b, "to"), direction);
  }
}

export function applySort(
  transactions: readonly TransactionWithPostings[],
  accountsById: ReadonlyMap<string, AccountRow>,
  sortState: SortState | null,
): TransactionWithPostings[] {
  if (!sortState) return [...transactions];
  return [...transactions].sort((a, b) => compareTransactions(a, b, accountsById, sortState));
}
