import { TrendingUp } from "lucide-react";
import { db } from "@/server/persistence/client";
import { listInvestmentTransactions } from "@/server/services/investmentTransactions";
import { getInstrumentValuation } from "@/server/services/navHistory";
import { CardPanelFigure } from "./card-panel-figure";

// Portfolio Value panel (Portfolio Adoption Plan, UI pass 2026-09-05) —
// unblocks docs/10-open-decisions.md's own note that Investment-dependent
// panels were "gated on the Instrument/Valuation model" (ADR-037). Reuses
// `text-category-asset` rather than a new color (docs' own color-
// semantics rule: same tokens everywhere, no per-panel decoration) — an
// investment is economically an Asset, same as the Assets panel's own
// figure.
export async function PortfolioValuePanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const transactions = listInvestmentTransactions(db, profileId);
  const instrumentIds = [...new Set(transactions.map((t) => t.instrumentId))];

  const total = instrumentIds.reduce((sum, instrumentId) => {
    const valuation = getInstrumentValuation(db, profileId, instrumentId, currency.minorUnitScale);
    return sum + (valuation.value ?? 0);
  }, 0);

  return (
    <CardPanelFigure amountMinor={total} currency={currency} colorClassName="text-category-asset" icon={TrendingUp} href="/portfolio" />
  );
}
