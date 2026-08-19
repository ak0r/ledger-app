"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  serializeTransactionFilter,
  type FilterCondition,
  type TransactionFilterState,
} from "@/lib/transaction-filter";
import type { SortState } from "@/lib/transaction-sort";

// Always-visible description search, separate from the full Filter drawer
// but sharing the exact same underlying condition model (product-polish
// delta plan §14: "must work identically" everywhere) — typing here upserts
// a single description-"contains" condition (tagged with a fixed id so it
// can be replaced/removed cleanly) into the same serialized `filter` query
// param the drawer reads/writes. Opening the drawer afterwards shows this
// condition for real, not a shadow state.
const QUICK_SEARCH_CONDITION_ID = "quick-search";
const DEBOUNCE_MS = 350;

export function TransactionQuickSearch({
  baseHref,
  filterState,
  sortState,
}: {
  baseHref: string;
  filterState: TransactionFilterState;
  // Same posture as `TransactionFilterDrawer`'s own prop — a search
  // keystroke must not silently drop the active sort.
  sortState?: SortState | null;
}) {
  const router = useRouter();
  const existing = filterState.conditions.find((c) => c.id === QUICK_SEARCH_CONDITION_ID);
  const [value, setValue] = useState(typeof existing?.value === "string" ? existing.value : "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applyValue = (next: string) => {
    const withoutQuickSearch = filterState.conditions.filter((c) => c.id !== QUICK_SEARCH_CONDITION_ID);
    const trimmed = next.trim();
    const conditions: FilterCondition[] = trimmed
      ? [
          ...withoutQuickSearch,
          { id: QUICK_SEARCH_CONDITION_ID, field: "description", operator: "contains", value: trimmed },
        ]
      : withoutQuickSearch;

    const nextState: TransactionFilterState = { match: filterState.match, conditions };
    const params = new URLSearchParams();
    if (conditions.length > 0) params.set("filter", serializeTransactionFilter(nextState));
    if (sortState) {
      params.set("sort", sortState.field);
      params.set("dir", sortState.direction);
    }
    const query = params.toString();
    router.replace(query ? `${baseHref}?${query}` : baseHref);
  };

  return (
    <div className="relative w-full max-w-56">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        placeholder="Search description…"
        aria-label="Search transactions by description"
        className="pl-8"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => applyValue(next), DEBOUNCE_MS);
        }}
      />
    </div>
  );
}
