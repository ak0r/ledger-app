import { redirect } from "next/navigation";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { listDistinctTags } from "@/server/services/tags";
import { TransactionForm } from "@/components/transaction-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function NewTransactionPage(props: PageProps<"/transactions/new">) {
  const searchParams = await props.searchParams;
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  const accounts = listAccounts(db, profile.id);
  if (currencies.length === 0 || accounts.length < 2) {
    redirect("/transactions");
  }

  const currenciesById = new Map(currencies.map((c) => [c.id, c]));
  const fallbackCurrency = currencies[0];
  const accountIdParam = Array.isArray(searchParams.accountId)
    ? searchParams.accountId[0]
    : searchParams.accountId;
  const defaultFromAccountId = accounts.some((account) => account.id === accountIdParam)
    ? accountIdParam
    : undefined;

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle as="h1">New Transaction</CardTitle>
      </CardHeader>
      <CardContent>
        <TransactionForm
          accounts={accounts.map((account) => {
            const accountCurrency = currenciesById.get(account.currencyId);
            return {
              id: account.id,
              name: account.name,
              classification: account.classification,
              icon: account.icon,
              currencyId: account.currencyId,
              currencySymbol: accountCurrency?.symbol ?? fallbackCurrency.symbol,
              currencyScale: accountCurrency?.minorUnitScale ?? fallbackCurrency.minorUnitScale,
            };
          })}
          existingTags={listDistinctTags(db, profile.id)}
          defaultFromAccountId={defaultFromAccountId}
          cancelHref={defaultFromAccountId ? `/accounts/${defaultFromAccountId}` : undefined}
        />
      </CardContent>
    </Card>
  );
}
