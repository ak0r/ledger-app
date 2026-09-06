import type { InstrumentType } from "@/core";
import { formatMoney } from "@/lib/utils";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

// Account-type-driven secondary metric cards for the Account Detail header
// (product cleanup pass). Deliberately *not* a generic "This Month" card
// bolted onto every account — the metrics shown vary by `instrumentType`,
// limited to what's actually computable from postings alone. Two real
// domain constraints keep this list short (AGENTS.md rule #20 — flagged,
// not silently worked around):
// - Mutual Fund/Stock/Commodity (added by the 2026-08-19 account-model
//   delta) get the same Balance + Inflow/Outflow treatment as Bank/Cash —
//   quantity/price/valuation/gain/XIRR are explicitly future capability
//   work (delta §12/§18), not yet computable from postings alone, so no
//   Units/Latest Price/Gain/XIRR cards until that lands.
// - LOAN is "a plain liability ledger account only" (rule #12) — no
//   principal/interest split or APR field exists, so no such cards for
//   Loan. "This Month" (payment made) *is* shown — that's just this
//   month's balance-decreasing postings, no extra schema needed.
// No global date-range selector exists yet (a separate, larger piece of
// work tied to the History tab's own charts) — "This Month"/"YTD" are
// real calendar windows (current month, Jan 1–today), labeled explicitly
// so they never *imply* a selectable period that isn't there.
//
// The account's own Balance/Outstanding/Total figure is already shown
// prominently above this row (`AccountLayout`'s big `font-mono text-xl`
// line) — these cards are the *secondary* tier only, not a redundant
// restatement of the primary number.
export interface AccountMetricPeriod {
  thisMonthInflow: number;
  thisMonthOutflow: number;
  ytdInflow: number;
  ytdOutflow: number;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm" className="w-40">
      <div className="flex flex-col gap-1 px-(--card-spacing)">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-lg tabular-nums">{value}</CardTitle>
      </div>
    </Card>
  );
}

export function AccountMetricCards({
  instrumentType,
  period,
  currencySymbol,
  currencyScale,
}: {
  instrumentType: InstrumentType;
  period: AccountMetricPeriod;
  currencySymbol: string;
  currencyScale: number;
}) {
  const money = (amount: number) => formatMoney(amount, currencySymbol, currencyScale);

  switch (instrumentType) {
    case "BANK":
    case "CASH":
      return (
        <div className="flex flex-wrap gap-3">
          <MetricCard label="Inflow (this month)" value={money(period.thisMonthInflow)} />
          <MetricCard label="Outflow (this month)" value={money(period.thisMonthOutflow)} />
          <MetricCard
            label="Net Cashflow (this month)"
            value={money(period.thisMonthInflow - period.thisMonthOutflow)}
          />
        </div>
      );
    case "CREDIT_CARD":
      return (
        <div className="flex flex-wrap gap-3">
          <MetricCard label="This Month (spend)" value={money(period.thisMonthInflow)} />
        </div>
      );
    case "LOAN":
      return (
        <div className="flex flex-wrap gap-3">
          <MetricCard label="This Month (paid)" value={money(period.thisMonthOutflow)} />
        </div>
      );
    case "INCOME":
    case "EXPENSE":
      return (
        <div className="flex flex-wrap gap-3">
          <MetricCard label="This Month" value={money(period.thisMonthInflow)} />
          <MetricCard label="Year to Date" value={money(period.ytdInflow)} />
        </div>
      );
    // BALANCING (opening-balance mechanism, not a browsable day-to-day
    // account) keeps today's plain Name + Balance header, no card row.
    case "BALANCING":
      return null;
  }
}
