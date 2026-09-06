import { redirect } from "next/navigation";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listCurrencies } from "@/server/services/currencies";
import { listDistinctTags } from "@/server/services/tags";
import { AccountForm } from "@/components/account-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  if (currencies.length === 0) redirect("/accounts");
  const defaultCurrencyId = currencies.some((c) => c.id === profile.primaryCurrencyId)
    ? (profile.primaryCurrencyId ?? undefined)
    : undefined;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle as="h1">New Account</CardTitle>
      </CardHeader>
      <CardContent>
        <AccountForm
          mode="create"
          currencies={currencies.map((c) => ({
            id: c.id,
            code: c.code,
            symbol: c.symbol,
            minorUnitScale: c.minorUnitScale,
          }))}
          defaultCurrencyId={defaultCurrencyId}
          existingTags={listDistinctTags(db, profile.id)}
        />
      </CardContent>
    </Card>
  );
}
