"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronsUpDown, Filter, Plus, Trash2 } from "lucide-react";
import { fromMinorUnits, toMinorUnits } from "@/core";
import type { AccountRow } from "@/server/repositories/accounts";
import {
  serializeTransactionFilter,
  type FilterCondition,
  type FilterField,
  type TransactionFilterState,
} from "@/lib/transaction-filter";
import type { SortState } from "@/lib/transaction-sort";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AccountForm } from "@/components/account-form";

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
  onApply,
  accountCreation,
}: {
  // Optional when `onApply` is given (Import's client-state usage has no
  // URL to navigate to at all — see import-workspace.tsx).
  baseHref?: string;
  accounts: Pick<AccountRow, "id" | "name">[];
  currency: { symbol: string; minorUnitScale: number };
  initialState: TransactionFilterState;
  lockedAccountId?: string;
  // Applying a filter change must not silently drop the active sort
  // (src/lib/transaction-sort.ts) — carried through unchanged into the
  // navigated href, same as `page.tsx`'s own `pageHref` preserves it across
  // a page/pageSize change.
  sortState?: SortState | null;
  // Client-state escape hatch (Import review workspace — no URL/searchParams
  // round-trip there, everything lives in React state) — when given, Apply
  // calls this instead of `router.push`. The Transactions/Account-Detail
  // pages don't pass it and keep the original URL-driven behavior.
  onApply?: (state: TransactionFilterState) => void;
  // Enables "Create new account" inside the From/To Account value picker
  // (search-or-create, same shape as InstrumentPicker) — opt-in, since it
  // needs Currency context the Import review workspace doesn't have a
  // reason to pass (that flow has its own dedicated account-resolution UI,
  // AGENTS.md rule #26) and Account Detail's own filter hasn't asked for
  // it. Only `transactions/page.tsx` passes this.
  accountCreation?: {
    currencies: { id: string; code: string; symbol: string; minorUnitScale: number }[];
    defaultCurrencyId?: string;
    existingTags?: string[];
  };
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
    if (onApply) {
      onApply(state);
      setOpen(false);
      return;
    }
    const params = new URLSearchParams();
    if (conditions.length > 0) params.set("filter", serializeTransactionFilter(state));
    if (sortState) {
      params.set("sort", sortState.field);
      params.set("dir", sortState.direction);
    }
    const query = params.toString();
    router.push(query ? `${baseHref}?${query}` : (baseHref ?? ""));
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
      <SheetContent className="md:max-w-md gap-3 overflow-y-auto">
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
                accountCreation={accountCreation}
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
  accountCreation,
  onChange,
}: {
  condition: FilterCondition;
  accountOptions: { label: string; value: string }[];
  currency: { symbol: string; minorUnitScale: number };
  accountCreation?: {
    currencies: { id: string; code: string; symbol: string; minorUnitScale: number }[];
    defaultCurrencyId?: string;
    existingTags?: string[];
  };
  onChange: (value: FilterCondition["value"]) => void;
}) {
  if (NO_VALUE_OPERATORS.has(condition.operator)) return null;

  if (condition.field === "fromAccount" || condition.field === "toAccount") {
    const multiple = MULTI_ACCOUNT_OPERATORS.has(condition.operator);
    return (
      <AccountValuePicker
        multiple={multiple}
        value={condition.value ?? (multiple ? [] : "")}
        options={accountOptions}
        creation={accountCreation}
        onChange={onChange}
      />
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

// From/To Account value picker — a search-or-create combobox (same Popover
// + Input + list shape as InstrumentPicker, docs/07-decisions.md's UI-
// consistency posture for "same control, same look everywhere"), replacing
// a plain unsearchable <Select> that got unusable once an Account list grew
// past a handful of entries. "Create new account" only appears once the
// search has zero matches, and only when `creation` is given — it opens the
// same AccountForm every other creation entry point uses, not a shortcut
// duplicate of it. On success the new Account is applied to this condition
// immediately (no waiting on `router.refresh()`, which AccountForm still
// calls itself — that's what makes every *other* row's picker, and the rest
// of the page, see the new Account too).
function AccountValuePicker({
  multiple,
  value,
  options,
  creation,
  onChange,
}: {
  multiple: boolean;
  value: FilterCondition["value"];
  options: { label: string; value: string }[];
  creation?: {
    currencies: { id: string; code: string; symbol: string; minorUnitScale: number }[];
    defaultCurrencyId?: string;
    existingTags?: string[];
  };
  onChange: (value: FilterCondition["value"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // Optimistic: an Account created from this picker is usable immediately,
  // without waiting for the `accounts` prop (`options` here) to catch up
  // via `router.refresh()` — same reasoning as InstrumentPicker's own
  // create flow.
  const [createdOptions, setCreatedOptions] = useState<{ label: string; value: string }[]>([]);

  const allOptions = [...options, ...createdOptions.filter((c) => !options.some((o) => o.value === c.value))];
  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? allOptions.filter((option) => option.label.toLowerCase().includes(trimmedQuery))
    : allOptions;

  const selectedValues = multiple
    ? ((Array.isArray(value) ? value : []) as string[])
    : typeof value === "string" && value
      ? [value]
      : [];
  const selectedLabels = allOptions
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);

  function select(accountId: string) {
    if (multiple) {
      const next = selectedValues.includes(accountId)
        ? selectedValues.filter((v) => v !== accountId)
        : [...selectedValues, accountId];
      onChange(next);
    } else {
      onChange(accountId);
      setOpen(false);
    }
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
          }
        >
          <span className={cn("truncate", selectedLabels.length === 0 && "text-muted-foreground")}>
            {selectedLabels.length > 0
              ? selectedLabels.join(", ")
              : multiple
                ? "Choose Accounts…"
                : "Choose an Account…"}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <Input
            autoFocus
            placeholder="Search accounts…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No accounts found.</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => select(option.value)}
                >
                  <span className="truncate">{option.label}</span>
                  {selectedValues.includes(option.value) && (
                    <Check className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                </button>
              ))
            )}
            {filtered.length === 0 && creation && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-muted"
              >
                <Plus className="size-3.5 shrink-0" aria-hidden="true" />
                Create new account
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {creation && (
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent className="md:max-w-md gap-4 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>New Account</SheetTitle>
            </SheetHeader>
            {createOpen && (
              <AccountForm
                currencies={creation.currencies}
                defaultCurrencyId={creation.defaultCurrencyId}
                mode="create"
                existingTags={creation.existingTags}
                onCreated={(account) => {
                  setCreatedOptions((prev) => [...prev, { label: account.name, value: account.id }]);
                  select(account.id);
                }}
                onSuccess={() => setCreateOpen(false)}
                onCancel={() => setCreateOpen(false)}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
