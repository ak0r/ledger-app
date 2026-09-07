import type { Route } from "next";
import Link from "next/link";
import { Coins, PiggyBank, TrendingUp } from "lucide-react";
import { fromQuantityMinorUnits, type InstrumentBackedType } from "@/core";
import { db } from "@/server/persistence/client";
import { listInvestmentTransactionsForInstrument } from "@/server/services/investmentTransactions";
import { getInstrumentValuation } from "@/server/services/navHistory";
import { getHoldingIntegrity } from "@/server/services/holdings";
import { listCurrencies } from "@/server/services/currencies";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardPanelFigure } from "@/components/dashboard-panels/card-panel-figure";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatMoney } from "@/lib/utils";

// Security = the investment itself (name, latest NAV/price — a market
// fact, same for every investor). Holding = this Profile's own position in
// it (units, invested, current value). Both facts legitimately belong on
// one page — this is the one place they coexist — but the two stat blocks
// below are grouped and labeled so neither reads as a generic, undifferentiated
// number (UX review, 2026-09-05 accepted correction).
const ASSET_CLASS_BY_TYPE: Record<InstrumentBackedType, { href: Route; label: string } | undefined> = {
  MUTUAL_FUND: { href: "/portfolio/mutual-funds", label: "Mutual Funds" },
  STOCK: { href: "/portfolio/stocks", label: "Stocks" },
  COMMODITY: undefined,
};

// Shared security/holding detail body (Portfolio UI/Navigation Model
// delta, 2026-09-05 §5) — "what exactly is this holding doing?" One
// component for both asset classes (§4's "same general page pattern"),
// with the one real label difference (NAV vs. Price) as a prop, not two
// near-duplicate files. Total Return/XIRR are "Not available yet" rather
// than a fabricated number — nothing computes them yet (Portfolio
// Adoption Plan's own V2 list), and this delta's own rule is explicit:
// "do not force [a holding] to expose data that is not supported by its
// available history."
//
// Transactions here are the read-only history this delta moves out of any
// top-level Portfolio > Transactions page (§7) — import-derived facts
// (§6/§9), never a create/edit/delete surface.
export async function PortfolioSecurityDetail({
  profileId,
  instrumentId,
  instrumentName,
  type,
}: {
  profileId: string;
  instrumentId: string;
  instrumentName: string;
  type: InstrumentBackedType;
}) {
  const currencies = listCurrencies(db, profileId);
  const currency = currencies[0];
  const priceLabel = type === "MUTUAL_FUND" ? "Latest NAV" : "Current Price";

  const transactions = [...listInvestmentTransactionsForInstrument(db, profileId, instrumentId)].sort(
    (a, b) => b.date.localeCompare(a.date),
  );
  const invested = transactions.reduce((sum, t) => {
    if (t.type === "BUY" || t.type === "TRANSFER_IN") return sum + t.amount;
    if (t.type === "SELL" || t.type === "TRANSFER_OUT") return sum - t.amount;
    return sum;
  }, 0);
  const valuation = currency
    ? getInstrumentValuation(db, profileId, instrumentId, currency.minorUnitScale)
    : { units: 0, latestNav: undefined, value: undefined, missingNavReason: undefined, xirr: undefined };
  const integrity = getHoldingIntegrity(db, profileId, instrumentId);
  const assetClass = ASSET_CLASS_BY_TYPE[type];

  return (
    <div className="flex flex-col gap-4">
      <div>
        {assetClass && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/portfolio" className="hover:text-foreground">
              Portfolio
            </Link>
            <span aria-hidden="true">/</span>
            <Link href={assetClass.href} className="hover:text-foreground">
              {assetClass.label}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-foreground">{instrumentName}</span>
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{instrumentName}</h1>
          {integrity === "SNAPSHOT_ONLY" && (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
              Snapshot only
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">About this Security</p>
        <div className="grid gap-4 sm:max-w-56">
          <Card>
            <CardHeader>
              <CardDescription>{priceLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {valuation.latestNav !== undefined && currency ? (
                <CardPanelFigure
                  amountMinor={Math.round(valuation.latestNav * 10 ** currency.minorUnitScale)}
                  currency={currency}
                  colorClassName="text-foreground"
                  icon={Coins}
                />
              ) : (
                <span className="text-sm text-muted-foreground">{valuation.missingNavReason ?? "—"}</span>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Your Holding</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Invested</CardDescription>
            </CardHeader>
            <CardContent>
              {currency ? (
                <CardPanelFigure amountMinor={invested} currency={currency} colorClassName="text-foreground" icon={PiggyBank} />
              ) : (
                <span className="font-mono text-xl tabular-nums text-muted-foreground">—</span>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Current Value</CardDescription>
            </CardHeader>
            <CardContent>
              {valuation.value !== undefined && currency ? (
                <CardPanelFigure amountMinor={valuation.value} currency={currency} colorClassName="text-foreground" icon={TrendingUp} />
              ) : (
                <span className="font-mono text-xl tabular-nums text-muted-foreground">—</span>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{type === "MUTUAL_FUND" ? "XIRR" : "Quantity"}</CardDescription>
              {type === "MUTUAL_FUND" ? (
                valuation.xirr !== undefined ? (
                  <CardTitle
                    className={cn(
                      "font-mono text-xl tabular-nums",
                      valuation.xirr >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {valuation.xirr >= 0 ? "+" : ""}
                    {(valuation.xirr * 100).toFixed(2)}%
                  </CardTitle>
                ) : (
                  <CardTitle className="text-sm font-normal text-muted-foreground">Not available yet</CardTitle>
                )
              ) : (
                <CardTitle className="font-mono text-xl tabular-nums">
                  {fromQuantityMinorUnits(valuation.units).toFixed(4)}
                </CardTitle>
              )}
            </CardHeader>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            Read-only — imported from a statement or entered by a Portfolio import.
            {integrity === "SNAPSHOT_ONLY" &&
              " The imported history doesn't fully account for the statement's own reported balance — Invested/XIRR above may be understated. Import a since-inception statement to fill the gap."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => {
                  const txnCurrency = currencies.find((c) => c.id === t.currencyId) ?? currency;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground">{t.date}</TableCell>
                      <TableCell>{t.type}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {t.type === "DIVIDEND" ? "—" : fromQuantityMinorUnits(t.units).toFixed(4)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {t.type === "DIVIDEND" || !txnCurrency
                          ? "—"
                          : formatMoney(Math.round(t.price * 10 ** txnCurrency.minorUnitScale), txnCurrency.symbol, txnCurrency.minorUnitScale)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {txnCurrency ? formatMoney(t.amount, txnCurrency.symbol, txnCurrency.minorUnitScale) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
