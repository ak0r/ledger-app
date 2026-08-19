import { notFound } from "next/navigation";
import { getFamilyDb } from "@/server/db/family-client";
import { getAccountBalances } from "@/server/use-cases/accounts";
import { listCurrencies } from "@/server/use-cases/currencies";
import {
  getAccountRangeSummary,
  getBalanceTrend,
  getMonthlyCashflow,
} from "@/server/use-cases/accountHistory";
import { parseInsightsRangePreset, resolveInsightsRange } from "@/lib/insights-range";
import { fromMinorUnits } from "@/domain";
import { formatMoney } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountCashflowChart } from "@/components/account-cashflow-chart";
import { AccountBalanceTrendChart } from "@/components/account-balance-trend-chart";
import { AccountTrendChart } from "@/components/account-trend-chart";
import { InsightsRangeSelector } from "@/components/insights-range-selector";
import { InsightsStatsStrip } from "@/components/insights-stats-strip";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Insights tab (product refresh, renamed from History) — "Transactions
// tell you what happened. Insights tell you what it means." Deliberately
// restrained (§4/§11 of the refresh brief): one primary chart, at most one
// secondary chart, a small stats strip — never a wall of KPI cards, never
// every computable metric. Content is account-type-conditional (§5-9);
// stats here are period-scoped (whatever the range selector picked),
// complementary to the header's point-in-time Balance/Outstanding/Total
// card, not a restatement of it.
//
// Investment account types (Mutual Fund/Stock/ETF) and Loan's principal/
// interest split stay out of scope for the same reason they did in the
// account header metric cards — AGENTS.md rule #11's frozen instrument
// taxonomy has no such types, and no principal/interest/APR field exists
// on Loan (rule #12: "a plain liability ledger account only"). Every
// instrument type below gets exactly what's computable from postings
// alone, nothing implied beyond that.
export default async function AccountInsightsPage(
  props: PageProps<"/f/[familyId]/m/[memberId]/accounts/[accountId]/insights">,
) {
  const { familyId, memberId, accountId } = await props.params;
  const db = getFamilyDb(familyId);

  const account = getAccountBalances(db, memberId).find((a) => a.id === accountId);
  if (!account) notFound();

  const currency = listCurrencies(db, memberId)[0];
  if (!currency) notFound();

  const searchParams = await props.searchParams;
  const asParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const rangePreset = parseInsightsRangePreset(asParam(searchParams.range));
  const range = resolveInsightsRange(rangePreset);

  const baseHref = `/f/${familyId}/m/${memberId}/accounts/${accountId}/insights`;
  const scale = currency.minorUnitScale;
  const money = (amount: number) => formatMoney(amount, currency.symbol, scale);

  // Opening-balance mechanism, not a day-to-day browsable account (same
  // call made for the header's own metric cards) — no Insights content.
  if (account.instrumentType === "BALANCING") {
    return (
      <div className="flex flex-col gap-4">
        <InsightsRangeSelector baseHref={baseHref} current={rangePreset} />
        <p className="text-sm text-muted-foreground">Insights aren&apos;t available for this account.</p>
      </div>
    );
  }

  const summary = getAccountRangeSummary(db, memberId, accountId, range);

  const balanceTrendData = () =>
    getBalanceTrend(db, memberId, accountId, range).map((point) => ({
      date: point.date,
      balance: fromMinorUnits(point.balance, scale),
    }));

  const cashflowData = () =>
    getMonthlyCashflow(db, memberId, accountId, range).map((point) => ({
      month: point.month,
      inflow: fromMinorUnits(point.inflow, scale),
      outflow: fromMinorUnits(point.outflow, scale),
    }));

  let content: React.ReactNode;

  switch (account.instrumentType) {
    case "BANK":
    case "CASH": {
      content = (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Balance Trend">
              <AccountBalanceTrendChart data={balanceTrendData()} currencySymbol={currency.symbol} />
            </ChartCard>
            <ChartCard title="Inflow / Outflow" description="Money in vs. out, by month">
              <AccountCashflowChart data={cashflowData()} currencySymbol={currency.symbol} />
            </ChartCard>
          </div>
          <InsightsStatsStrip
            stats={[
              { label: "Net Change", value: money(summary.netChange) },
              { label: "Total Inflow", value: money(summary.totalInflow) },
              { label: "Total Outflow", value: money(summary.totalOutflow) },
            ]}
          />
        </>
      );
      break;
    }
    case "CREDIT_CARD": {
      content = (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard title="Outstanding Trend">
              <AccountBalanceTrendChart data={balanceTrendData()} currencySymbol={currency.symbol} />
            </ChartCard>
            <ChartCard title="Spend / Payments" description="New charges vs. payments made, by month">
              <AccountCashflowChart data={cashflowData()} currencySymbol={currency.symbol} />
            </ChartCard>
          </div>
          <InsightsStatsStrip
            stats={[
              { label: "Net Change", value: money(summary.netChange) },
              { label: "Total Spend", value: money(summary.totalInflow) },
              { label: "Total Payments", value: money(summary.totalOutflow) },
            ]}
          />
        </>
      );
      break;
    }
    case "LOAN": {
      // No secondary chart — Principal vs. Interest would need a field
      // this domain doesn't have (see file-level comment). Outstanding
      // trend + a stats strip is everything actually knowable.
      content = (
        <>
          <ChartCard title="Outstanding Trend">
            <AccountBalanceTrendChart data={balanceTrendData()} currencySymbol={currency.symbol} />
          </ChartCard>
          <InsightsStatsStrip
            stats={[
              { label: "Opening Balance", value: money(summary.openingBalance) },
              { label: "Payments Made", value: money(summary.totalOutflow) },
              { label: "Net Change", value: money(summary.netChange) },
            ]}
          />
        </>
      );
      break;
    }
    case "INCOME":
    case "EXPENSE": {
      const monthly = getMonthlyCashflow(db, memberId, accountId, range);
      const trend = monthly.map((point) => ({
        month: point.month,
        amount: fromMinorUnits(point.inflow, scale),
      }));
      const monthsWithActivity = monthly.filter((point) => point.inflow > 0);
      const average =
        monthsWithActivity.length > 0
          ? Math.round(summary.totalInflow / monthsWithActivity.length)
          : 0;
      const highest = monthly.reduce((max, point) => Math.max(max, point.inflow), 0);
      content = (
        <>
          <ChartCard title={account.classification === "INCOME" ? "Income Trend" : "Expense Trend"}>
            <AccountTrendChart data={trend} currencySymbol={currency.symbol} />
          </ChartCard>
          <InsightsStatsStrip
            stats={[
              { label: "Total", value: money(summary.totalInflow) },
              { label: "Average / Month", value: money(average) },
              { label: "Highest Month", value: money(highest) },
            ]}
          />
        </>
      );
      break;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <InsightsRangeSelector baseHref={baseHref} current={rangePreset} />
      {content}
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
