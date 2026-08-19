"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { accountFilterToParams, type AccountFilterState } from "@/lib/account-filter";
import type { AccountSortState } from "@/lib/account-sort";

// Always-visible name search for the Accounts list — same debounced,
// URL-driven posture as TransactionQuickSearch, searching `name` instead of
// `description`. Typing here updates the `q` param while preserving the
// filter drawer's own classification/instrument selections and the active
// sort (same "changing one control must not silently drop another" rule
// established for Transactions' sort/filter interplay).
const DEBOUNCE_MS = 350;

export function AccountQuickSearch({
  baseHref,
  filterState,
  sortState,
}: {
  baseHref: string;
  filterState: AccountFilterState;
  sortState: AccountSortState | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(filterState.search);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applyValue = (next: string) => {
    const params = accountFilterToParams({ ...filterState, search: next.trim() });
    if (sortState) {
      params.sort = sortState.field;
      params.dir = sortState.direction;
    }
    const query = new URLSearchParams(params).toString();
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
        placeholder="Search accounts…"
        aria-label="Search accounts by name"
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
