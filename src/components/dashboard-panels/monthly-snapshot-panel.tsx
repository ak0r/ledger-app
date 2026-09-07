import { db } from "@/server/persistence/client";
import { getMonthlySnapshot } from "@/server/services/dashboardMetrics";
import { cn, formatMoney } from "@/lib/utils";

// "What happened financially this month?" (Dashboard System Phase 1
// delta §7.1) — Income/Spent/Saved/Savings Rate side by side, a 2x1 wide
// stat strip rather than a single hero figure (this is 4 numbers, not
// one). No moral judgement in the copy (delta §2.4) — plain figures only,
// the panel doesn't editorialize whether the rate is "good."
export async function MonthlySnapshotPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const snapshot = getMonthlySnapshot(db, profileId);
  const savedColor = snapshot.savedMinor >= 0 ? "text-success" : "text-destructive";

  return (
    // A fixed 2x2 internal sub-grid, not a viewport-breakpoint-based one
    // (`sm:grid-cols-4` looked fine at full page width in isolation, but
    // this panel's actual rendered width is its own 2-column dashboard
    // cell, not the viewport — at real panel width, 4 money figures side
    // by side overlapped. Caught live, not by tsc/lint.).
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Income</span>
        <span className="font-mono text-lg tabular-nums">{formatMoney(snapshot.incomeMinor, currency.symbol, currency.minorUnitScale)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Spent</span>
        <span className="font-mono text-lg tabular-nums">{formatMoney(snapshot.spentMinor, currency.symbol, currency.minorUnitScale)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Saved</span>
        <span className={cn("font-mono text-lg tabular-nums", savedColor)}>
          {formatMoney(snapshot.savedMinor, currency.symbol, currency.minorUnitScale)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Savings Rate</span>
        <span className={cn("font-mono text-lg tabular-nums", savedColor)}>
          {snapshot.savingsRatePercent === null ? "—" : `${snapshot.savingsRatePercent.toFixed(0)}%`}
        </span>
      </div>
    </div>
  );
}
