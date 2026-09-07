import { db } from "@/server/persistence/client";
import { getSpendingTrend } from "@/server/services/dashboardMetrics";
import { cn, formatMoney } from "@/lib/utils";

// "Is my spending increasing or decreasing?" (Dashboard System Phase 1
// delta §7.5) — this month against a trailing 6-month rolling average,
// not an isolated number (delta §2.3). Direction/magnitude only, no
// moral framing (§2.4): "12% above your average," never "you're
// overspending."
export async function SpendingTrendPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const trend = getSpendingTrend(db, profileId);
  const direction = trend.percentVsAverage === null ? null : trend.percentVsAverage >= 0 ? "above" : "below";
  const color = direction === "above" ? "text-destructive" : direction === "below" ? "text-success" : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">This month</span>
        <span className="font-mono text-lg tabular-nums">{formatMoney(trend.thisMonthMinor, currency.symbol, currency.minorUnitScale)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">6-month average</span>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatMoney(Math.round(trend.rollingAverageMinor), currency.symbol, currency.minorUnitScale)}
        </span>
      </div>
      {direction && (
        <p className={cn("text-sm", color)}>
          {Math.abs(trend.percentVsAverage!).toFixed(0)}% {direction} your average
        </p>
      )}
    </div>
  );
}
