"use client";

import type { BudgetSummary } from "@/server/services/budgets";
import { formatDate, formatMoney, humanizeEnum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetFormSheet } from "@/components/budget-form-sheet";
import { BudgetPeriodReviewSheet } from "@/components/budget-period-review-sheet";
import { DeleteBudgetButton } from "@/components/delete-budget-button";
import type { BudgetFormExpenseAccount } from "@/components/budget-form";

// Landing page (spec §15.1) — one card per Budget with its current Period's
// Target/Actual/Remaining, plus a "Review Next Period" affordance once
// `reviewDue` (spec §16/§17's "ending soon"/"next ready" states, use-cases/
// budgets.ts's listBudgetsWithSummary). Home/dashboard surfacing of the same
// signal is Phase E, not this pass.
export function BudgetList({
  summaries,
  expenseAccounts,
  currencySymbol,
  currencyScale,
}: {
  summaries: BudgetSummary[];
  expenseAccounts: BudgetFormExpenseAccount[];
  currencySymbol: string;
  currencyScale: number;
}) {
  if (summaries.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No budgets yet.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {summaries.map(({ budget, actuals, reviewDue }) => {
        const targetMinor = actuals?.totalTargetMinor ?? 0;
        const actualMinor = actuals?.totalActualMinor ?? 0;
        const remainingMinor = targetMinor - actualMinor;

        return (
          <Card key={budget.id}>
            <CardHeader>
              <CardTitle>{budget.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {budget.type === "ONE_TIME"
                  ? "One-time"
                  : `Every ${budget.recurrenceInterval} ${humanizeEnum(budget.recurrenceUnit ?? "").toLowerCase()}`}
                {actuals?.period.startDate && actuals.period.endDate && (
                  <> · {formatDate(actuals.period.startDate)} – {formatDate(actuals.period.endDate)}</>
                )}
              </p>

              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Budgeted</span>
                  <span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(targetMinor, currencySymbol, currencyScale)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Spent</span>
                  <span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(actualMinor, currencySymbol, currencyScale)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Remaining</span>
                  <span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(remainingMinor, currencySymbol, currencyScale)}</span>
                </div>
              </div>

              {reviewDue && (
                <BudgetPeriodReviewSheet
                  budgetId={budget.id}
                  budgetName={budget.name}
                  expenseAccounts={expenseAccounts}
                  currencySymbol={currencySymbol}
                  currencyScale={currencyScale}
                  trigger={
                    <Button type="button" variant="default" size="sm" className="self-start">
                      Review Next Period
                    </Button>
                  }
                />
              )}

              <div className="flex justify-end gap-1.5 pt-1">
                <BudgetFormSheet
                  expenseAccounts={expenseAccounts}
                  currencySymbol={currencySymbol}
                  currencyScale={currencyScale}
                  budget={{
                    id: budget.id,
                    name: budget.name,
                    type: budget.type,
                    recurrenceUnit: budget.recurrenceUnit,
                    recurrenceInterval: budget.recurrenceInterval,
                    recurrenceStartDate: budget.recurrenceStartDate,
                    recurrenceEndDate: budget.recurrenceEndDate,
                    recurrenceOccurrences: budget.recurrenceOccurrences,
                    explicitAccountIds: budget.explicitAccountIds,
                    filterMatch: budget.filterMatch,
                    filterConditions: budget.filterConditions,
                    allocations: (actuals?.rows ?? [])
                      .filter((row) => row.targetAmountMinor != null)
                      .map((row) => ({ expenseAccountId: row.expenseAccountId, targetAmountMinor: row.targetAmountMinor as number })),
                  }}
                  trigger={
                    <Button type="button" variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
                <DeleteBudgetButton budgetId={budget.id} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
