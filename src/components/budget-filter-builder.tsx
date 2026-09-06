"use client";

import { Plus, Trash2 } from "lucide-react";
import type { BudgetFilterCondition, BudgetFilterField, BudgetFilterMatch, BudgetFilterState } from "@/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Inline condition builder for a Budget's Scope (spec §6.2/§7) — embedded
// directly in BudgetForm rather than a Sheet/drawer overlay, since the
// mockup (§15.3) shows it as an always-visible part of the Create/Edit
// Budget form, not something toggled behind a Filter button. Deliberately
// a separate component from TransactionFilterDrawer (spec §7's explicit
// call, domain/budget.ts's own header comment) even though the row-editing
// shape looks similar — different field set, different value shapes, and a
// third NONE match mode Transaction List's filter doesn't have.
const FIELDS: { value: BudgetFilterField; label: string }[] = [
  { value: "expenseAccount", label: "Expense Account" },
  { value: "date", label: "Date" },
  { value: "tags", label: "Tags" },
  { value: "description", label: "Description" },
];

const OPERATORS: Record<BudgetFilterField, { value: BudgetFilterCondition["operator"]; label: string }[]> = {
  expenseAccount: [
    { value: "is", label: "Is" },
    { value: "is-not", label: "Is not" },
  ],
  date: [
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "between", label: "Between" },
  ],
  tags: [
    { value: "contains", label: "Contains" },
    { value: "not-contains", label: "Does not contain" },
  ],
  description: [
    { value: "contains", label: "Contains" },
    { value: "is", label: "Is" },
    { value: "is-not", label: "Is not" },
  ],
};

const MATCH_OPTIONS: { value: BudgetFilterMatch; label: string }[] = [
  { value: "ALL", label: "all conditions" },
  { value: "ANY", label: "any condition" },
  { value: "NONE", label: "none of the conditions" },
];

function defaultCondition(field: BudgetFilterField): BudgetFilterCondition {
  const operator = OPERATORS[field][0].value;
  return { id: crypto.randomUUID(), field, operator, value: field === "date" && operator === "between" ? ["", ""] : "" };
}

export function BudgetFilterBuilder({
  value,
  onChange,
  expenseAccounts,
}: {
  value: BudgetFilterState;
  onChange: (state: BudgetFilterState) => void;
  expenseAccounts: { id: string; name: string }[];
}) {
  function updateCondition(id: string, patch: Partial<BudgetFilterCondition>) {
    onChange({ ...value, conditions: value.conditions.map((c) => (c.id === id ? ({ ...c, ...patch } as BudgetFilterCondition) : c)) });
  }

  function setField(id: string, field: BudgetFilterField) {
    updateCondition(id, defaultCondition(field));
  }

  function setOperator(id: string, operator: string) {
    updateCondition(id, { operator, value: operator === "between" ? ["", ""] : "" } as Partial<BudgetFilterCondition>);
  }

  function removeCondition(id: string) {
    onChange({ ...value, conditions: value.conditions.filter((c) => c.id !== id) });
  }

  function addCondition() {
    onChange({ ...value, conditions: [...value.conditions, defaultCondition("expenseAccount")] });
  }

  return (
    <div className="flex flex-col gap-3">
      {value.conditions.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Match</span>
          <Select value={value.match} onValueChange={(match) => onChange({ ...value, match: match as BudgetFilterMatch })}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.conditions.map((condition) => (
        <div key={condition.id} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2.5 ring-1 ring-foreground/10">
          <div className="flex items-center gap-1.5">
            <Select value={condition.field} onValueChange={(field) => setField(condition.id, field as BudgetFilterField)}>
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
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={() => removeCondition(condition.id)}>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>

          <Select value={condition.operator} onValueChange={(operator) => setOperator(condition.id, operator as string)}>
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

          <ConditionValueInput condition={condition} expenseAccounts={expenseAccounts} onChange={(v) => updateCondition(condition.id, { value: v } as Partial<BudgetFilterCondition>)} />
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="self-start" onClick={addCondition}>
        <Plus className="size-3.5" aria-hidden="true" />
        Add condition
      </Button>
    </div>
  );
}

function ConditionValueInput({
  condition,
  expenseAccounts,
  onChange,
}: {
  condition: BudgetFilterCondition;
  expenseAccounts: { id: string; name: string }[];
  onChange: (value: string | [string, string]) => void;
}) {
  if (condition.field === "expenseAccount") {
    const current = typeof condition.value === "string" ? condition.value : "";
    return (
      <Select value={current} onValueChange={(v) => onChange(v as string)}>
        <SelectTrigger>
          <SelectValue placeholder="Choose an account…" />
        </SelectTrigger>
        <SelectContent>
          {expenseAccounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (condition.field === "date" && condition.operator === "between") {
    const [from, to] = Array.isArray(condition.value) ? condition.value : ["", ""];
    return (
      <div className="flex items-center gap-2">
        <Input type="date" aria-label="From date" value={from} onChange={(e) => onChange([e.target.value, to])} />
        <span className="text-muted-foreground">to</span>
        <Input type="date" aria-label="To date" value={to} onChange={(e) => onChange([from, e.target.value])} />
      </div>
    );
  }

  if (condition.field === "date") {
    const current = typeof condition.value === "string" ? condition.value : "";
    return <Input type="date" value={current} onChange={(e) => onChange(e.target.value)} />;
  }

  const current = typeof condition.value === "string" ? condition.value : "";
  return <Input placeholder="Value…" value={current} onChange={(e) => onChange(e.target.value)} />;
}
