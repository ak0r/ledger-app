"use client";

import type { BudgetAllocationInput } from "@/domain";
import { fromMinorUnits, toMinorUnits } from "@/domain";
import { formatMoney } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Targets for the explicitly-selected Expense Accounts only (spec §8) —
// filter-derived accounts with no allocation (spec §8.2's "Shopping: Budget
// Not set") only ever appear once the Budget exists and actuals are
// computed against real transactions (Budget detail view, not this form) —
// there is nothing to preview client-side at create/edit time without a
// server round trip evaluating every transaction against the draft filter.
export function BudgetAllocationsTable({
  accounts,
  value,
  onChange,
  currencySymbol,
  currencyScale,
}: {
  accounts: { id: string; name: string }[];
  value: BudgetAllocationInput[];
  onChange: (allocations: BudgetAllocationInput[]) => void;
  currencySymbol: string;
  currencyScale: number;
}) {
  const targetByAccount = new Map(value.map((a) => [a.expenseAccountId, a.targetAmountMinor]));

  function setTarget(expenseAccountId: string, majorAmount: number) {
    const targetAmountMinor = majorAmount > 0 ? toMinorUnits(majorAmount, currencyScale) : 0;
    const next = value.filter((a) => a.expenseAccountId !== expenseAccountId);
    if (targetAmountMinor > 0) next.push({ expenseAccountId, targetAmountMinor });
    onChange(next);
  }

  const totalMinor = value.reduce((sum, a) => sum + a.targetAmountMinor, 0);

  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">Select at least one Expense Account to set targets.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {accounts.map((account) => {
        const targetMinor = targetByAccount.get(account.id) ?? 0;
        return (
          <div key={account.id} className="flex items-center gap-2.5">
            <Label className="flex-1 font-normal">{account.name}</Label>
            <Input
              type="number"
              step={10 ** -currencyScale}
              min="0"
              placeholder="0.00"
              className="w-32"
              defaultValue={targetMinor > 0 ? fromMinorUnits(targetMinor, currencyScale) : ""}
              onChange={(e) => setTarget(account.id, Number(e.target.value) || 0)}
            />
          </div>
        );
      })}

      <div className="flex items-center justify-between border-t pt-3 text-sm font-medium">
        <span>Total Budget</span>
        <span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(totalMinor, currencySymbol, currencyScale)}</span>
      </div>
    </div>
  );
}
