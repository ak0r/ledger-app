import { CreditCard } from "lucide-react";
import { db } from "@/server/persistence/client";
import { getAccountBalances } from "@/server/services/accounts";
import { CardPanelFigure } from "./card-panel-figure";

export async function LiabilitiesPanel({
  profileId,
  currency,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
}) {
  const balances = getAccountBalances(db, profileId);
  const total = balances.filter((a) => a.classification === "LIABILITY").reduce((sum, a) => sum + a.balance, 0);

  return (
    <CardPanelFigure amountMinor={total} currency={currency} colorClassName="text-category-liability" icon={CreditCard} href="/accounts" />
  );
}
