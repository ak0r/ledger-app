import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { listCurrencies } from "@/server/use-cases/currencies";
import { listDistinctTags } from "@/server/use-cases/tags";
import { AccountForm } from "@/components/account-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function NewAccountPage(props: PageProps<"/p/[profileId]/accounts/new">) {
  const { profileId } = await props.params;
  const currencies = listCurrencies(db, profileId);
  if (currencies.length === 0) redirect(`/p/${profileId}/accounts`);

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle as="h1">New Account</CardTitle>
      </CardHeader>
      <CardContent>
        <AccountForm
          profileId={profileId}
          mode="create"
          currencies={currencies.map((c) => ({
            id: c.id,
            code: c.code,
            symbol: c.symbol,
            minorUnitScale: c.minorUnitScale,
          }))}
          existingTags={listDistinctTags(db, profileId)}
        />
      </CardContent>
    </Card>
  );
}
