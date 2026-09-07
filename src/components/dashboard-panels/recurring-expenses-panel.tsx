import { db } from "@/server/persistence/client";
import { getRecurringExpensesSummary } from "@/server/services/dashboardMetrics";
import { formatMoney } from "@/lib/utils";

// "What recurring commitments am I carrying?" (Dashboard System Phase 1
// delta §7.8) — total monthly-equivalent + a list, each line labeled by
// its own Recurring Rule name/to-Account (no new categorization grouping
// — a rule already has a natural label). Change-tracking vs prior periods
// is a deliberate cut for this pass (no historical snapshot of Recurring
// Rules exists yet to compare against) — gated behind the eligibility
// check (panel-eligibility.ts) so this never renders with zero rules.
export async function RecurringExpensesPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const summary = getRecurringExpensesSummary(db, profileId);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-mono text-xl tabular-nums">
          {formatMoney(Math.round(summary.totalMonthlyEquivalentMinor), currency.symbol, currency.minorUnitScale)} / month
        </p>
        <p className="text-xs text-muted-foreground">
          {summary.lines.length} active recurring expense{summary.lines.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {summary.lines.map((line) => (
          <li key={line.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">{line.toAccountName}</span>
            <span className="shrink-0 font-mono tabular-nums">
              {formatMoney(Math.round(line.monthlyEquivalentMinor), currency.symbol, currency.minorUnitScale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
