import { Wallet } from "lucide-react";
import { db } from "@/server/db/client";
import { getAccountBalances } from "@/server/use-cases/accounts";
import { CardPanelFigure } from "./card-panel-figure";

// Runtime-derived, never persisted (spec §7/§27) — Assets minus
// Liabilities, summed fresh from postings on every render. Colored by
// sign (success/positive vs destructive/negative), same convention as
// every other signed money figure in this codebase (e.g.
// import-workspace.tsx's debit/credit coloring) — Net Worth isn't itself
// a Classification, so it has no `text-category-*` token of its own.
export async function NetWorthPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const balances = getAccountBalances(db, profileId);
  const sum = (classification: string) => balances.filter((a) => a.classification === classification).reduce((total, a) => total + a.balance, 0);
  const netWorth = sum("ASSET") - sum("LIABILITY");

  return (
    <CardPanelFigure
      amountMinor={netWorth}
      currency={currency}
      colorClassName={netWorth >= 0 ? "text-success" : "text-destructive"}
      icon={Wallet}
    />
  );
}
