import { db } from "@/server/persistence/client";
import { getBudgetHealth } from "@/server/services/dashboardMetrics";
import { cn, formatMoney } from "@/lib/utils";

// "Am I on pace against my Budgets?" (Dashboard System Phase 1 delta
// §7.9) — actual spend vs a pace-based expected-by-today figure for the
// current Period, plus how many of the last few real (permanently
// persisted) Budget Periods were exceeded. Gated by panel-eligibility.ts
// so this never renders with zero Budgets.
export async function BudgetHealthPanel({ profileId, currency }: { profileId: string; currency: { symbol: string; minorUnitScale: number } }) {
  const lines = getBudgetHealth(db, profileId);

  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">No Budget currently has an active Period.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {lines.map((line) => {
        const aheadOfPace = line.expectedByTodayMinor !== null && line.actualMinor > line.expectedByTodayMinor;
        const percentOfTarget = line.targetMinor > 0 ? Math.min(100, (line.actualMinor / line.targetMinor) * 100) : 0;
        return (
          <li key={line.budgetId} className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{line.budgetName}</span>
              <span className={cn("shrink-0 font-mono tabular-nums", aheadOfPace ? "text-destructive" : "text-muted-foreground")}>
                {formatMoney(line.actualMinor, currency.symbol, currency.minorUnitScale)} /{" "}
                {formatMoney(line.targetMinor, currency.symbol, currency.minorUnitScale)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", aheadOfPace ? "bg-destructive" : "bg-success")}
                style={{ width: `${percentOfTarget}%` }}
              />
            </div>
            {line.consideredPeriodCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Exceeded {line.exceededCount} of the last {line.consideredPeriodCount} Period{line.consideredPeriodCount === 1 ? "" : "s"}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
