import Link from "next/link";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { ImportWorkspace } from "@/components/import-workspace";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function NewImportPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);

  // Account Resolution delta (2026-08-26) §3 — no upfront account
  // selection: an import can create its own first Account from the
  // statement itself, so an empty Accounts list is no longer a blocker.
  // Only Currency still is (`createAccount`/`commitImport` both require
  // one) — same guard `transactions/page.tsx` already uses.
  if (currencies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h1">Set up a Currency first</CardTitle>
          <CardDescription>Head to Accounts to set up ₹ INR before importing a statement.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/accounts" className={buttonVariants()}>
            Go to Accounts
          </Link>
        </CardContent>
      </Card>
    );
  }

  const currency = currencies[0];
  const accounts = listAccounts(db, profile.id).filter((account) => !account.isArchived);

  return (
    // A data-heavy workbench, not a narrow content page (unlike New
    // Account/other `max-w-*` cards) — fills the shell's own max-w-5xl cap
    // (src/app/(app)/layout.tsx) so the transaction review table has real
    // room, unlike the narrower `max-w-lg`/`max-w-2xl` forms elsewhere.
    <Card>
      <CardHeader>
        <CardTitle as="h1">New Import</CardTitle>
        <CardDescription>
          Upload one or more statements, review and edit the proposed transactions, then approve them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ImportWorkspace
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            classification: account.classification,
            icon: account.icon,
          }))}
          currencySymbol={currency.symbol}
          currencyScale={currency.minorUnitScale}
        />
      </CardContent>
    </Card>
  );
}
