import { db } from "@/server/persistence/client";
import { getSavingsRateTrend } from "@/server/services/dashboardMetrics";
import { cn } from "@/lib/utils";

// "Am I saving more or less than usual?" (Dashboard System Phase 1 delta
// §7.2) — this month's rate against a trailing 3-month average. Income
// Allocation's own target concept is skipped this pass (open decision,
// docs/10-open-decisions.md), so this compares against the trend only,
// never a target — direction/magnitude only, no moral framing (§2.4).
export async function SavingsRatePanel({ profileId }: { profileId: string; currency: { symbol: string; minorUnitScale: number } }) {
  const trend = getSavingsRateTrend(db, profileId);

  if (trend.currentRatePercent === null) {
    return <p className="text-sm text-muted-foreground">No income recorded this month yet.</p>;
  }

  const direction = trend.deltaPoints === null ? null : trend.deltaPoints >= 0 ? "up" : "down";
  const color = direction === "up" ? "text-success" : direction === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">This month</span>
        <span className="font-mono text-2xl tabular-nums">{trend.currentRatePercent.toFixed(0)}%</span>
      </div>
      {trend.averageRatePercent !== null && (
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">3-month average</span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">{trend.averageRatePercent.toFixed(0)}%</span>
        </div>
      )}
      {direction && trend.deltaPoints !== null && (
        <p className={cn("text-sm", color)}>
          {Math.abs(trend.deltaPoints).toFixed(0)} points {direction} from your average
        </p>
      )}
    </div>
  );
}
