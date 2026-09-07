import { db } from "@/server/persistence/client";
import { getCreditCardHealth } from "@/server/services/dashboardMetrics";
import { cn, formatMoney } from "@/lib/utils";

// "Is my credit card spending under control?" (Dashboard System Phase 1
// delta §7.7) — this month's spend (the credit side of a Credit Card
// account, per docs/03-accounting-principles.md's own worked example)
// against a trailing 3-month average, plus the current outstanding
// balance. "Paid in full" detection is out of scope for the whole delta
// (confirmed earlier this session). Gated by panel-eligibility.ts so this
// never renders with zero Credit Card accounts.
export async function CreditCardHealthPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const health = getCreditCardHealth(db, profileId);
  const direction = health.percentVsAverage === null ? null : health.percentVsAverage >= 0 ? "above" : "below";
  const color = direction === "above" ? "text-destructive" : direction === "below" ? "text-success" : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">This month&apos;s spend</span>
        <span className="font-mono text-lg tabular-nums">{formatMoney(health.thisMonthSpendMinor, currency.symbol, currency.minorUnitScale)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Outstanding balance</span>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatMoney(health.outstandingBalanceMinor, currency.symbol, currency.minorUnitScale)}
        </span>
      </div>
      {direction && (
        <p className={cn("text-sm", color)}>
          {Math.abs(health.percentVsAverage!).toFixed(0)}% {direction} your 3-month average
        </p>
      )}
    </div>
  );
}
