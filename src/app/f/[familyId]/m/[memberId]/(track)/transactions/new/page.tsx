import { redirect } from "next/navigation";
import { getFamilyDb } from "@/server/db/family-client";
import { listAccounts } from "@/server/use-cases/accounts";
import { listCurrencies } from "@/server/use-cases/currencies";
import { listDistinctTags } from "@/server/use-cases/tags";
import { TransactionForm } from "@/components/transaction-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function NewTransactionPage(
  props: PageProps<"/f/[familyId]/m/[memberId]/transactions/new">,
) {
  const { familyId, memberId } = await props.params;
  const searchParams = await props.searchParams;
  const db = getFamilyDb(familyId);
  const currencies = listCurrencies(db, memberId);
  const accounts = listAccounts(db, memberId);
  if (currencies.length === 0 || accounts.length < 2) {
    redirect(`/f/${familyId}/m/${memberId}/transactions`);
  }

  const currency = currencies[0];
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
          familyId={familyId}
          memberId={memberId}
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            classification: account.classification,
          }))}
          currencySymbol={currency.symbol}
          currencyScale={currency.minorUnitScale}
          existingTags={listDistinctTags(db, memberId)}
          defaultFromAccountId={defaultFromAccountId}
          cancelHref={
            defaultFromAccountId
              ? `/f/${familyId}/m/${memberId}/accounts/${defaultFromAccountId}`
              : undefined
          }
        />
      </CardContent>
    </Card>
  );
}
