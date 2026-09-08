import { notFound } from "next/navigation";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { getAccount } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { listDistinctTags } from "@/server/services/tags";
import { getCreditCardDetails, getLoanDetails } from "@/server/services/liabilityDetails";
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
export default async function AccountSettingsPage(props: PageProps<"/accounts/[accountId]/settings">) {
  const { accountId } = await props.params;
  const { profile } = await requireActiveProfile();

  const account = getAccount(db, accountId, profile.id);
  if (!account) notFound();

  const currency = listCurrencies(db, profile.id).find((c) => c.id === account.currencyId);
  if (!currency) notFound();

  const creditCardDetails =
    account.accountType === "CREDIT_CARD" ? (getCreditCardDetails(db, account.id, profile.id) ?? null) : null;
  const loanDetails = account.accountType === "LOAN" ? (getLoanDetails(db, account.id, profile.id) ?? null) : null;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm
            mode="edit"
            currencies={[]}
            existingTags={listDistinctTags(db, profile.id)}
            account={{
              id: account.id,
              currencyId: account.currencyId,
              currencyCode: currency.code,
              name: account.name,
              classification: account.classification,
              accountType: account.accountType ?? "BANK",
              tags: account.tags,
              icon: account.icon,
            }}
            creditCardDetails={creditCardDetails}
            loanDetails={loanDetails}
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
            <ArchiveAccountButton accountId={accountId} variant="outline" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
