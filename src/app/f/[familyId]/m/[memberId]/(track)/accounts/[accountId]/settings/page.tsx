import { notFound } from "next/navigation";
import { getFamilyDb } from "@/server/db/family-client";
import { getAccount } from "@/server/use-cases/accounts";
import { listCurrencies } from "@/server/use-cases/currencies";
import { listDistinctTags } from "@/server/use-cases/tags";
import { AccountForm } from "@/components/account-form";
import { ArchiveAccountButton } from "@/components/archive-account-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Settings tab (product-polish pass) — Tags, Currency (display-only, same
// domain rule as before), and the Account name/classification/type edit
// fields, all via the one redesigned AccountForm (it already covers
// exactly this content in edit mode) — plus Archive, replacing the old
// header's Edit/Archive actions and the standalone /edit route entirely.
export default async function AccountSettingsPage(
  props: PageProps<"/f/[familyId]/m/[memberId]/accounts/[accountId]/settings">,
) {
  const { familyId, memberId, accountId } = await props.params;
  const db = getFamilyDb(familyId);

  const account = getAccount(db, accountId, memberId);
  if (!account) notFound();

  const currency = listCurrencies(db, memberId).find((c) => c.id === account.currencyId);
  if (!currency) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm
            familyId={familyId}
            memberId={memberId}
            mode="edit"
            currencies={[]}
            existingTags={listDistinctTags(db, memberId)}
            account={{
              id: account.id,
              currencyId: account.currencyId,
              currencyCode: currency.code,
              name: account.name,
              classification: account.classification,
              instrumentType: account.instrumentType,
              tags: account.tags,
              icon: account.icon,
            }}
          />
        </CardContent>
      </Card>

      {!account.isArchived && (
        <Card>
          <CardHeader>
            <CardTitle>Archive</CardTitle>
            <CardDescription>
              Hide this Account from active use. Its existing Transactions and balance are
              unaffected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ArchiveAccountButton
              familyId={familyId}
              memberId={memberId}
              accountId={accountId}
              variant="outline"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
