import Link from "next/link";
import { PiggyBank, TrendingUp } from "lucide-react";
import type { InstrumentBackedType } from "@/core";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listCurrencies } from "@/server/services/currencies";
import { listInvestmentTransactions } from "@/server/services/investmentTransactions";
import { getInstrumentValuation } from "@/server/services/navHistory";
import { findInstrumentsByIds } from "@/server/repositories/instruments";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardPanelFigure } from "@/components/dashboard-panels/card-panel-figure";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ASSET_CLASSES: { type: InstrumentBackedType; label: string; href: string }[] = [
  { type: "MUTUAL_FUND", label: "Mutual Funds", href: "/portfolio/mutual-funds" },
  { type: "STOCK", label: "Stocks", href: "/portfolio/stocks" },
];

// Portfolio Overview (Portfolio UI/Navigation Model delta, 2026-09-05 §3) —
// "how is my entire investment portfolio doing?" A composition layer over
// core/portfolio, never a Ledger/Portfolio merge (§3's own rule). Return/
// XIRR/period-returns/allocation charts/data-integrity are deliberately
// absent — none of that is computed anywhere yet (Portfolio Adoption
// Plan's own V2 list); this page shows only what's genuinely derivable
// today (value, invested, holdings by asset class) rather than fabricate
// the rest.
export default async function PortfolioOverviewPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  const currency = currencies.find((c) => c.id === profile.primaryCurrencyId) ?? currencies[0];

  if (!currency) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h1">Set up a Currency first</CardTitle>
          <CardDescription>Head to Accounts to set up ₹ INR before using Portfolio.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/accounts" className={buttonVariants()}>
            Go to Accounts
          </Link>
        </CardContent>
      </Card>
    );
  }

  const transactions = listInvestmentTransactions(db, profile.id);
  const instrumentIds = [...new Set(transactions.map((t) => t.instrumentId))];
  const instrumentsById = findInstrumentsByIds(db, instrumentIds);

  const byAssetClass = ASSET_CLASSES.map((assetClass) => {
    const ids = instrumentIds.filter((id) => instrumentsById.get(id)?.type === assetClass.type);
    const invested = transactions
      .filter((t) => ids.includes(t.instrumentId))
      .reduce((sum, t) => {
        if (t.type === "BUY" || t.type === "TRANSFER_IN") return sum + t.amount;
        if (t.type === "SELL" || t.type === "TRANSFER_OUT") return sum - t.amount;
        return sum;
      }, 0);
    const value = ids.reduce(
      (sum, id) => sum + (getInstrumentValuation(db, profile.id, id, currency.minorUnitScale).value ?? 0),
      0,
    );
    return { ...assetClass, holdingCount: ids.length, invested, value };
  });

  const totalValue = byAssetClass.reduce((sum, a) => sum + a.value, 0);
  const totalInvested = byAssetClass.reduce((sum, a) => sum + a.invested, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Portfolio</h1>
        <div className="flex gap-2">
          <Link href="/portfolio/accounts" className={buttonVariants({ variant: "outline" })}>
            Accounts / Folios
          </Link>
          <Link href="/portfolio/imports" className={buttonVariants()}>
            Import CAS
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Value</CardDescription>
          </CardHeader>
          <CardContent>
            <CardPanelFigure amountMinor={totalValue} currency={currency} colorClassName="text-foreground" icon={TrendingUp} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Invested</CardDescription>
          </CardHeader>
          <CardContent>
            <CardPanelFigure amountMinor={totalInvested} currency={currency} colorClassName="text-foreground" icon={PiggyBank} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Return / XIRR</CardDescription>
            <CardTitle className="text-sm text-muted-foreground">Not available yet</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holdings by Asset Class</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {byAssetClass.map((assetClass) => (
            <Link
              key={assetClass.type}
              href={assetClass.href}
              className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-muted"
            >
              <span>
                {assetClass.label}
                <span className="ml-2 text-muted-foreground">
                  {assetClass.holdingCount} holding{assetClass.holdingCount === 1 ? "" : "s"}
                </span>
              </span>
              <span className="font-mono tabular-nums">
                {formatMoney(assetClass.value, currency.symbol, currency.minorUnitScale)}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
