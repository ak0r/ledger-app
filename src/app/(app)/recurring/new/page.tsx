import { redirect } from "next/navigation";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { RecurringForm } from "@/components/recurring-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Phase D smoke-test host for RecurringForm — becomes the "Add New" entry
// point once the Recurring page (Rules/Calendar tabs, spec §7) lands.
export default async function NewRecurringRulePage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  const accounts = listAccounts(db, profile.id);
  if (currencies.length === 0 || accounts.length < 2) {
    redirect("/transactions");
  }

  const currency = currencies[0];

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle as="h1">Create Recurring Rule</CardTitle>
      </CardHeader>
      <CardContent>
        <RecurringForm
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            classification: account.classification,
          }))}
          currencySymbol={currency.symbol}
          currencyScale={currency.minorUnitScale}
        />
      </CardContent>
    </Card>
  );
}
