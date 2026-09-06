import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listCurrencies } from "@/server/services/currencies";
import { PortfolioAssetClassOverview } from "@/components/portfolio-asset-class-overview";

export const dynamic = "force-dynamic";

export default async function StocksPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  const currency = currencies.find((c) => c.id === profile.primaryCurrencyId) ?? currencies[0];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Stocks</h1>
      <PortfolioAssetClassOverview
        profileId={profile.id}
        currency={currency}
        type="STOCK"
        basePath="/portfolio/stocks"
      />
    </div>
  );
}
