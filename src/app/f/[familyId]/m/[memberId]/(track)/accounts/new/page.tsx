import { redirect } from "next/navigation";
import { getFamilyDb } from "@/server/db/family-client";
import { listCurrencies } from "@/server/use-cases/currencies";
import { listDistinctTags } from "@/server/use-cases/tags";
import { AccountForm } from "@/components/account-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function NewAccountPage(
  props: PageProps<"/f/[familyId]/m/[memberId]/accounts/new">,
) {
  const { familyId, memberId } = await props.params;
  const db = getFamilyDb(familyId);
  const currencies = listCurrencies(db, memberId);
  if (currencies.length === 0) redirect(`/f/${familyId}/m/${memberId}/accounts`);

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle as="h1">New Account</CardTitle>
      </CardHeader>
      <CardContent>
        <AccountForm
          familyId={familyId}
          memberId={memberId}
          mode="create"
          currencies={currencies.map((c) => ({
            id: c.id,
            code: c.code,
            symbol: c.symbol,
            minorUnitScale: c.minorUnitScale,
          }))}
          existingTags={listDistinctTags(db, memberId)}
        />
      </CardContent>
    </Card>
  );
}
