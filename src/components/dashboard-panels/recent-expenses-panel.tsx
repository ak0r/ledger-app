import Link from "next/link";
import type { RecentExpensesPanelConfig } from "@/core";
import { db } from "@/server/persistence/client";
import { getExpenseTotalsByPeriod } from "@/server/services/dashboards";
import { formatMoney } from "@/lib/utils";

// Expense Account totals for a period — an aggregation view, not a raw
// transaction list (spec §10). Relative horizontal bar per account,
// matching spec's own worked example.
export async function RecentExpensesPanel({
  profileId,
  currency,
  configuration,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
  configuration: RecentExpensesPanelConfig;
}) {
  const totals = getExpenseTotalsByPeriod(db, profileId, configuration.period);

  if (totals.length === 0) {
    return <p className="text-sm text-muted-foreground">No expenses for this period.</p>;
  }

  const maxMinor = totals[0].totalMinor;

  return (
    <ul className="flex flex-col gap-2.5">
      {totals.map((total) => (
        <li key={total.accountId} className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between">
            <Link href={`/accounts/${total.accountId}`} className="hover:underline">
              {total.accountName}
            </Link>
            <span className="font-mono tabular-nums">{formatMoney(total.totalMinor, currency.symbol, currency.minorUnitScale)}</span>
          </div>
          {/* Uniform expense-category color (src/app/globals.css's
              `--category-expense` token) — every row here is already an
              Expense Account, so this isn't the per-row rainbow
              account-table.tsx's plain-text rule guards against. */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-category-expense" style={{ width: `${(total.totalMinor / maxMinor) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
