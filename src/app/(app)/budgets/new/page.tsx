import { redirect } from "next/navigation";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { BudgetForm } from "@/components/budget-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function NewBudgetPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  const accounts = listAccounts(db, profile.id);
  if (currencies.length === 0) {
    redirect("/budgets");
  }

  const currency = currencies[0];
  const expenseAccounts = accounts
    .filter((account) => account.classification === "EXPENSE")
    .map((account) => ({ id: account.id, name: account.name }));

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle as="h1">Create Budget</CardTitle>
      </CardHeader>
      <CardContent>
        <BudgetForm expenseAccounts={expenseAccounts} currencySymbol={currency.symbol} currencyScale={currency.minorUnitScale} />
      </CardContent>
    </Card>
  );
}
