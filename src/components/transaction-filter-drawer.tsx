"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Filter, Plus, Trash2 } from "lucide-react";
import { fromMinorUnits, toMinorUnits } from "@/domain";
import type { AccountRow } from "@/server/repositories/accounts";
import {
  serializeTransactionFilter,
  type FilterCondition,
  type FilterField,
  type TransactionFilterState,
} from "@/lib/transaction-filter";
import type { SortState } from "@/lib/transaction-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Generic condition-based filter drawer — replaces both the inline GET-form
// on the Member-level Transactions page and the old AccountFilterSheet
// (product-polish delta plan #1): one component, used both places. Apply
// navigates to `baseHref?filter=<JSON>` (decision: real client state while
// drafting, still a shareable/bookmarkable URL once applied).
const FIELDS: { value: FilterField; label: string }[] = [
  { value: "description", label: "Description" },
  { value: "fromAccount", label: "From Account" },
  { value: "toAccount", label: "To Account" },
  { value: "amount", label: "Amount" },
  { value: "date", label: "Date" },
  { value: "tags", label: "Tags" },
  { value: "isSplit", label: "Split" },
];

const OPERATORS: Record<FilterField, { value: string; label: string }[]> = {
  description: [
    { value: "contains", label: "Contains" },
    { value: "not-contains", label: "Does not contain" },
    { value: "is", label: "Is" },
    { value: "is-not", label: "Is not" },
    { value: "starts-with", label: "Starts with" },
    { value: "ends-with", label: "Ends with" },
  ],
  fromAccount: [
    { value: "is", label: "Is" },
    { value: "is-not", label: "Is not" },
    { value: "in", label: "Is any of" },
    { value: "not-in", label: "Is none of" },
  ],
  toAccount: [
    { value: "is", label: "Is" },
    { value: "is-not", label: "Is not" },
    { value: "in", label: "Is any of" },
    { value: "not-in", label: "Is none of" },
  ],
  amount: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "between", label: "Between" },
  ],
  date: [
    { value: "is", label: "Is" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "between", label: "Between" },
    { value: "today", label: "Today" },
    { value: "this-week", label: "This week" },
    { value: "this-month", label: "This month" },
    { value: "last-month", label: "Last month" },
  ],
  tags: [
    { value: "contains", label: "Has tag" },
    { value: "not-contains", label: "Missing tag" },
    { value: "has-any", label: "Has any of" },
    { value: "has-all", label: "Has all of" },
  ],
  isSplit: [
    { value: "is-split", label: "Is split" },
    { value: "is-not-split", label: "Is not split" },
  ],
};

const NO_VALUE_OPERATORS = new Set(["today", "this-week", "this-month", "last-month", "is-split", "is-not-split"]);
const MULTI_ACCOUNT_OPERATORS = new Set(["in", "not-in"]);

function newCondition(): FilterCondition {
  return { id: crypto.randomUUID(), field: "description", operator: "contains", value: "" };
}

function parseTagsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function TransactionFilterDrawer({
  baseHref,
  accounts,
  currency,
  initialState,
  lockedAccountId,
  sortState,
}: {
  baseHref: string;
  accounts: AccountRow[];
  currency: { symbol: string; minorUnitScale: number };
  initialState: TransactionFilterState;
  lockedAccountId?: string;
  // Applying a filter change must not silently drop the active sort
  // (src/lib/transaction-sort.ts) — carried through unchanged into the
  // navigated href, same as `page.tsx`'s own `pageHref` preserves it across
  // a page/pageSize change.
  sortState?: SortState | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [match, setMatch] = useState(initialState.match);
  const [conditions, setConditions] = useState<FilterCondition[]>(initialState.conditions);

  const activeCount = conditions.length;

  function updateCondition(id: string, patch: Partial<FilterCondition>) {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function setField(id: string, field: FilterField) {
    updateCondition(id, {
      field,
      operator: OPERATORS[field][0].value as FilterCondition["operator"],
      value: "",
    });
  }

  function setOperator(id: string, operator: string) {
    updateCondition(id, {
      operator: operator as FilterCondition["operator"],
      value: NO_VALUE_OPERATORS.has(operator) ? undefined : "",
    });
  }

  function removeCondition(id: string) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }

  function clearAll() {
    setConditions([]);
    setMatch("ALL");
  }

  function apply() {
    const state: TransactionFilterState = { match, conditions };
    const params = new URLSearchParams();
    if (conditions.length > 0) params.set("filter", serializeTransactionFilter(state));
    if (sortState) {
      params.set("sort", sortState.field);
      params.set("dir", sortState.direction);
    }
    const query = params.toString();
    router.push(query ? `${baseHref}?${query}` : baseHref);
    setOpen(false);
  }

  const accountOptions = accounts
    .filter((account) => account.id !== lockedAccountId)
    .map((account) => ({ label: account.name, value: account.id }));

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
      <SheetContent className="max-w-md gap-3 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter Transactions</SheetTitle>
        </SheetHeader>

        {conditions.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Match</span>
            <Select
              value={match}
              onValueChange={(value) => setMatch(value as "ALL" | "ANY")}
              items={[
                { label: "all conditions", value: "ALL" },
                { label: "any condition", value: "ANY" },
              ]}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">all conditions</SelectItem>
                <SelectItem value="ANY">any condition</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {conditions.map((condition) => (
            <div key={condition.id} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2.5 ring-1 ring-foreground/10">
              <div className="flex items-center gap-1.5">
                <Select
                  value={condition.field}
                  onValueChange={(value) => setField(condition.id, value as FilterField)}
                  items={FIELDS}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove condition"
                  onClick={() => removeCondition(condition.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>

              <Select
                value={condition.operator}
                onValueChange={(value) => setOperator(condition.id, value as string)}
                items={OPERATORS[condition.field]}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS[condition.field].map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <ConditionValueInput
                condition={condition}
                accountOptions={accountOptions}
                currency={currency}
                onChange={(value) => updateCondition(condition.id, { value })}
              />
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setConditions((prev) => [...prev, newCondition()])}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add condition
        </Button>

        <div className="mt-auto flex gap-2">
          {conditions.length > 0 && (
            <Button type="button" variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
          )}
          <Button type="button" className="flex-1" onClick={apply}>
            Apply
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ConditionValueInput({
  condition,
  accountOptions,
  currency,
  onChange,
}: {
  condition: FilterCondition;
  accountOptions: { label: string; value: string }[];
  currency: { symbol: string; minorUnitScale: number };
  onChange: (value: FilterCondition["value"]) => void;
}) {
  if (NO_VALUE_OPERATORS.has(condition.operator)) return null;

  if (condition.field === "fromAccount" || condition.field === "toAccount") {
    if (MULTI_ACCOUNT_OPERATORS.has(condition.operator)) {
      const value = (Array.isArray(condition.value) ? condition.value : []) as string[];
      return (
        <Select
          multiple
          value={value}
          onValueChange={(next) => onChange(next as string[])}
          items={accountOptions}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose Accounts…" />
          </SelectTrigger>
          <SelectContent>
            {accountOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Select
        value={typeof condition.value === "string" ? condition.value : ""}
        onValueChange={(value) => onChange(value as string)}
        items={accountOptions}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose an Account…" />
        </SelectTrigger>
        <SelectContent>
          {accountOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (condition.field === "amount") {
    if (condition.operator === "between") {
      const [min, max] = (Array.isArray(condition.value) ? condition.value : [0, 0]) as [number, number];
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            aria-label="Minimum amount"
            defaultValue={min ? fromMinorUnits(min, currency.minorUnitScale) : ""}
            onChange={(e) =>
              onChange([toMinorUnits(Number(e.target.value) || 0, currency.minorUnitScale), max])
            }
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="number"
            step="0.01"
            aria-label="Maximum amount"
            defaultValue={max ? fromMinorUnits(max, currency.minorUnitScale) : ""}
            onChange={(e) =>
              onChange([min, toMinorUnits(Number(e.target.value) || 0, currency.minorUnitScale)])
            }
          />
        </div>
      );
    }
    const amount = typeof condition.value === "number" ? condition.value : 0;
    return (
      <Input
        type="number"
        step="0.01"
        placeholder={`Amount (${currency.symbol})`}
        defaultValue={amount ? fromMinorUnits(amount, currency.minorUnitScale) : ""}
        onChange={(e) => onChange(toMinorUnits(Number(e.target.value) || 0, currency.minorUnitScale))}
      />
    );
  }

  if (condition.field === "date") {
    if (condition.operator === "between") {
      const [from, to] = (Array.isArray(condition.value) ? condition.value : ["", ""]) as [string, string];
      return (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="From date" value={from} onChange={(e) => onChange([e.target.value, to])} />
          <span className="text-muted-foreground">to</span>
          <Input type="date" aria-label="To date" value={to} onChange={(e) => onChange([from, e.target.value])} />
        </div>
      );
    }
    return (
      <Input
        type="date"
        value={typeof condition.value === "string" ? condition.value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (condition.field === "tags" && (condition.operator === "has-any" || condition.operator === "has-all")) {
    const value = (Array.isArray(condition.value) ? condition.value : []) as string[];
    return (
      <Input
        placeholder="tag1, tag2…"
        defaultValue={value.join(", ")}
        onChange={(e) => onChange(parseTagsInput(e.target.value))}
      />
    );
  }

  // description contains/is/etc, tags contains/not-contains — plain text
  return (
    <Input
      placeholder="Value…"
      value={typeof condition.value === "string" ? condition.value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
