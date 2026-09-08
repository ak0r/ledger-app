"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Filter } from "lucide-react";
import { CLASSIFICATIONS, ACCOUNT_TYPES, type Classification, type AccountType } from "@/core";
import { humanizeEnum } from "@/lib/utils";
import { accountFilterToParams, type AccountFilterState } from "@/lib/account-filter";
import type { AccountSortState } from "@/lib/account-sort";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Accounts list's filter — two fixed-cardinality checklists (Classification,
// Instrument Type; AGENTS.md rule #11's frozen taxonomy caps these at 5 and
// 7 values), not Transactions' generic field/operator condition-builder —
// see account-filter.ts's own comment for why that's the right amount of
// UI for this shape of filter. Same Sheet-drawer visual language as
// TransactionFilterDrawer (Filter button + active-count badge, Apply/Clear
// pair) for consistency, without importing that component's
// condition/operator machinery.
export function AccountFilterDrawer({
  baseHref,
  initialState,
  sortState,
}: {
  baseHref: string;
  initialState: AccountFilterState;
  sortState: AccountSortState | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [classifications, setClassifications] = useState<Classification[]>(initialState.classifications);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>(initialState.accountTypes);

  const activeCount = classifications.length + accountTypes.length;

  function toggle<T>(list: T[], setList: (next: T[]) => void, value: T) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function apply() {
    const params = accountFilterToParams({ classifications, accountTypes, search: initialState.search });
    if (sortState) {
      params.sort = sortState.field;
      params.dir = sortState.direction;
    }
    const query = new URLSearchParams(params).toString();
    router.push(query ? `${baseHref}?${query}` : baseHref);
    setOpen(false);
  }

  function clearAll() {
    setClassifications([]);
    setAccountTypes([]);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Filter className="size-3.5" aria-hidden="true" />
            Filter
            {activeCount > 0 && (
              <Badge variant="outline" className="ml-0.5 px-1.5">
                {activeCount}
              </Badge>
            )}
          </Button>
        }
      />
      <SheetContent className="gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter Accounts</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-4">
          <span className="text-sm font-medium">Classification</span>
          {CLASSIFICATIONS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={classifications.includes(value)}
                onCheckedChange={() => toggle(classifications, setClassifications, value)}
              />
              {humanizeEnum(value)}
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-2 px-4">
          <span className="text-sm font-medium">Account Type</span>
          {ACCOUNT_TYPES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={accountTypes.includes(value)}
                onCheckedChange={() => toggle(accountTypes, setAccountTypes, value)}
              />
              {humanizeEnum(value)}
            </label>
          ))}
        </div>

        <div className="flex gap-2 px-4">
          <Button type="button" variant="outline" onClick={clearAll}>
            Clear all
          </Button>
          <Button type="button" onClick={apply} className="flex-1">
            Apply
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
