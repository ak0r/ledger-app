import { CLASSIFICATIONS, INSTRUMENT_TYPES, type Classification, type InstrumentType } from "@/core";
import type { AccountWithBalance } from "@/server/services/accounts";

// Accounts list filter — deliberately *not* Transactions' generic
// condition-builder model (transaction-filter.ts's field/operator/value
// conditions): Classification and Instrument Type are each a small fixed
// enum (5 and 7 values respectively — AGENTS.md rule #11's frozen
// taxonomy), so "pick any of these values" checklists cover the real need
// without a condition-builder's extra UI/mental overhead. Plain
// comma-separated query params (`classification=ASSET,LIABILITY`,
// `instrument=BANK,CASH`, `q=hdfc`) rather than transaction-filter's single
// JSON-ish param — nothing here needs operators, so there's nothing a
// simpler encoding loses.
export interface AccountFilterState {
  classifications: Classification[];
  instrumentTypes: InstrumentType[];
  search: string;
}

export const EMPTY_ACCOUNT_FILTER: AccountFilterState = {
  classifications: [],
  instrumentTypes: [],
  search: "",
};

function parseEnumList<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set(allowed);
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is T => set.has(value as T));
}

export function parseAccountFilter(params: {
  classification?: string;
  instrument?: string;
  q?: string;
}): AccountFilterState {
  return {
    classifications: parseEnumList(params.classification, CLASSIFICATIONS),
    instrumentTypes: parseEnumList(params.instrument, INSTRUMENT_TYPES),
    search: params.q?.trim() ?? "",
  };
}

export function hasActiveAccountFilter(state: AccountFilterState): boolean {
  return state.classifications.length > 0 || state.instrumentTypes.length > 0 || state.search.length > 0;
}

// Shared by every href-builder that must preserve the current filter
// across a navigation it didn't itself originate (sort clicks, quick
// search debounce, filter drawer Apply) — same posture as
// transaction-sort.ts's `buildSortHref` preserving `filter`.
export function accountFilterToParams(state: AccountFilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.classifications.length > 0) params.classification = state.classifications.join(",");
  if (state.instrumentTypes.length > 0) params.instrument = state.instrumentTypes.join(",");
  if (state.search) params.q = state.search;
  return params;
}

export function applyAccountFilter(
  accounts: readonly AccountWithBalance[],
  state: AccountFilterState,
): AccountWithBalance[] {
  const search = state.search.toLowerCase();
  return accounts.filter((account) => {
    if (state.classifications.length > 0 && !state.classifications.includes(account.classification)) {
      return false;
    }
    if (state.instrumentTypes.length > 0 && !state.instrumentTypes.includes(account.instrumentType)) {
      return false;
    }
    if (search && !account.name.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });
}
