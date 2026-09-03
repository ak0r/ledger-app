import { db } from "@/server/db/client";
import { listAccounts } from "@/server/use-cases/accounts";
import { listBudgetsWithSummary } from "@/server/use-cases/budgets";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BudgetPeriodReviewSheet } from "@/components/budget-period-review-sheet";

// Reuses the exact Review & Create flow from the Budget Framework delta
// (BudgetPeriodReviewSheet, use-cases/budgets.ts's `reviewDue`) — carried
// over from the Home page's own hardcoded "Budgets needing review" card
// as a real Panel instead (this delta's own catalogue decision).
export async function BudgetsNeedingReviewPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const summaries = listBudgetsWithSummary(db, profileId).filter((s) => s.reviewDue);

  if (summaries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing needs review right now.</p>;
  }

  const expenseAccounts = listAccounts(db, profileId)
    .filter((account) => account.classification === "EXPENSE")
    .map((account) => ({ id: account.id, name: account.name }));

  return (
    <ul className="flex flex-col gap-3">
      {summaries.map(({ budget, actuals }) => (
        <li key={budget.id} className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-medium">{budget.name}</p>
            <p className="text-muted-foreground">{actuals?.period.endDate ? <>Ends {formatDate(actuals.period.endDate)}</> : "Ready for review"}</p>
          </div>
          <BudgetPeriodReviewSheet
            budgetId={budget.id}
            budgetName={budget.name}
            expenseAccounts={expenseAccounts}
            currencySymbol={currency.symbol}
            currencyScale={currency.minorUnitScale}
            trigger={
              <Button type="button" size="sm">
                Review
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
