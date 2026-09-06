import { PiggyBank } from "lucide-react";
import { db } from "@/server/persistence/client";
import { getAccountBalances } from "@/server/services/accounts";
import { CardPanelFigure } from "./card-panel-figure";

export async function AssetsPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const balances = getAccountBalances(db, profileId);
  const total = balances.filter((a) => a.classification === "ASSET").reduce((sum, a) => sum + a.balance, 0);

  return (
    <CardPanelFigure amountMinor={total} currency={currency} colorClassName="text-category-asset" icon={PiggyBank} href="/accounts" />
  );
}
