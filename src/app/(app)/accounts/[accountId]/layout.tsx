import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { requireActiveProfile } from "@/server/authz";
import { getAccountBalances, listAccounts } from "@/server/use-cases/accounts";
import { listCurrencies } from "@/server/use-cases/currencies";
import { getMonthlyCashflow } from "@/server/use-cases/accountHistory";
import { formatMoney } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccountIcon } from "@/components/account-icon";
import { AccountTabs } from "@/components/account-tabs";
import { AccountMetricCards } from "@/components/account-metric-cards";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Account Detail shell (product-polish pass, tabs renamed to Transactions |
// Insights | Settings in the product refresh): Name → Balance → Add
// Transaction, then the three tabs (route-based, see account-tabs.tsx).
// Shared across all three tab routes so the header and the Account/
// Currency lookups happen once, not per-tab.
export default async function AccountLayout({
  params,
  children,
}: {
  params: Promise<{ accountId: string }>;
  children: React.ReactNode;
}) {
  const { accountId } = await params;
  const { profile } = await requireActiveProfile();

  const account = getAccountBalances(db, profile.id).find((a) => a.id === accountId);
  if (!account) notFound();

  const currency = listCurrencies(db, profile.id)[0];
  if (!currency) notFound();

  const accounts = listAccounts(db, profile.id);
  // Same gate as Add Transaction everywhere else (a Transaction needs a
  // distinct From/To account) — never a silent bounce.
  const canCreateTransaction = accounts.length >= 2;

  // Real wall-clock "this month"/"year to date" — deliberately fixed
  // calendar windows, not the Insights tab's own user-selectable range
  // (insights-range.ts): the header is point-in-time/current-state by
  // design and doesn't change when switching tabs (product refresh §1),
  // while Insights' stats are period-scoped and complementary, not a
  // restatement (§6). Reuses Insights' own `getMonthlyCashflow` (same
  // inflow/outflow definition) so the two never silently disagree about
  // what "inflow" means for this account.
  const now = new Date().toISOString().slice(0, 10);
  const currentMonth = now.slice(0, 7);
  const currentYear = now.slice(0, 4);
  const monthlyCashflow = getMonthlyCashflow(db, profile.id, accountId);
  const thisMonthPoint = monthlyCashflow.find((point) => point.month === currentMonth);
  const ytd = monthlyCashflow
    .filter((point) => point.month.startsWith(currentYear))
    .reduce(
      (acc, point) => ({ inflow: acc.inflow + point.inflow, outflow: acc.outflow + point.outflow }),
      { inflow: 0, outflow: 0 },
    );

  const accountBase = `/accounts/${accountId}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <AccountIcon classification={account.classification} icon={account.icon} className="size-5" />
            {account.name}
            {account.isArchived && (
              <Badge variant="outline" className="ml-1">
                Archived
              </Badge>
            )}
          </h1>
          <p className="font-mono text-xl font-semibold tabular-nums">
            {formatMoney(account.balance, currency.symbol, currency.minorUnitScale)}
          </p>
        </div>
        {canCreateTransaction && (
          <Link
            href={`/transactions/new?accountId=${accountId}`}
            className={buttonVariants()}
          >
            + Add Transaction
          </Link>
        )}
      </div>

      <AccountMetricCards
        instrumentType={account.instrumentType}
        currencySymbol={currency.symbol}
        currencyScale={currency.minorUnitScale}
        period={{
          thisMonthInflow: thisMonthPoint?.inflow ?? 0,
          thisMonthOutflow: thisMonthPoint?.outflow ?? 0,
          ytdInflow: ytd.inflow,
          ytdOutflow: ytd.outflow,
        }}
      />

      <AccountTabs baseHref={accountBase} />

      {children}
    </div>
  );
}
