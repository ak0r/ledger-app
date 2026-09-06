import Link from "next/link";
import { PiggyBank, TrendingUp } from "lucide-react";
import { fromQuantityMinorUnits, type InstrumentBackedType } from "@/core";
import { db } from "@/server/persistence/client";
import { listInvestmentTransactions } from "@/server/services/investmentTransactions";
import { getInstrumentValuation } from "@/server/services/navHistory";
import { findInstrumentsByIds } from "@/server/repositories/instruments";
import { getHoldingIntegrity } from "@/server/services/holdings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardPanelFigure } from "@/components/dashboard-panels/card-panel-figure";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/utils";

// Shared asset-class overview body (Portfolio UI/Navigation Model delta,
// 2026-09-05 §4) — Mutual Funds and Stocks "follow the same general page
// pattern," so the pattern lives once here; each asset class's own
// page.tsx is a thin wrapper passing its own `type` and base route. Return/
// XIRR/NAV-history/composition are deliberately absent — none of that is
// computed anywhere yet (Portfolio Adoption Plan's own V2 list), and this
// delta's own §4 rule is explicit: "do not force [an asset class] to
// expose data that is not supported by its available history."
export async function PortfolioAssetClassOverview({
  profileId,
  currency,
  type,
  basePath,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number } | undefined;
  type: InstrumentBackedType;
  basePath: string;
}) {
  const transactions = listInvestmentTransactions(db, profileId);
  const instrumentIds = [...new Set(transactions.map((t) => t.instrumentId))];
  const instrumentsById = findInstrumentsByIds(db, instrumentIds);
  const idsOfType = instrumentIds.filter((id) => instrumentsById.get(id)?.type === type);

  const rows = idsOfType
    .map((instrumentId) => ({
      instrumentId,
      name: instrumentsById.get(instrumentId)?.name ?? "—",
      integrity: getHoldingIntegrity(db, profileId, instrumentId),
      ...(currency
        ? getInstrumentValuation(db, profileId, instrumentId, currency.minorUnitScale)
        : { units: 0, latestNav: undefined, value: undefined, missingNavReason: undefined, xirr: undefined }),
    }))
    .filter((row) => row.units !== 0);

  const invested = transactions
    .filter((t) => idsOfType.includes(t.instrumentId))
    .reduce((sum, t) => {
      if (t.type === "BUY" || t.type === "TRANSFER_IN") return sum + t.amount;
      if (t.type === "SELL" || t.type === "TRANSFER_OUT") return sum - t.amount;
      return sum;
    }, 0);
  const totalValue = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Portfolio Value</CardDescription>
            {!currency && <CardTitle className="text-2xl">—</CardTitle>}
          </CardHeader>
          {currency && (
            <CardContent>
              <CardPanelFigure amountMinor={totalValue} currency={currency} colorClassName="text-foreground" icon={TrendingUp} />
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Invested</CardDescription>
            {!currency && <CardTitle className="text-2xl">—</CardTitle>}
          </CardHeader>
          {currency && (
            <CardContent>
              <CardPanelFigure amountMinor={invested} currency={currency} colorClassName="text-foreground" icon={PiggyBank} />
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Return</CardDescription>
            <CardTitle className="text-sm text-muted-foreground">Not available yet</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No holdings yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Latest NAV</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.instrumentId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`${basePath}/${row.instrumentId}`}
                          className="text-foreground underline underline-offset-4"
                        >
                          {row.name}
                        </Link>
                        {row.integrity === "SNAPSHOT_ONLY" && (
                          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                            Snapshot only
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fromQuantityMinorUnits(row.units).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.latestNav !== undefined && currency
                        ? formatMoney(Math.round(row.latestNav * 10 ** currency.minorUnitScale), currency.symbol, currency.minorUnitScale)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.value !== undefined && currency
                        ? formatMoney(row.value, currency.symbol, currency.minorUnitScale)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
