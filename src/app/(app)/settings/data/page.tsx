import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActiveProfile } from "@/server/authz";
import { ExportTransactionsButton } from "@/components/export-transactions-button";
import { ResetLedgerDialog } from "@/components/reset-ledger-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Data Management (2026-09-03 Settings/Backup/Data Management delta §14) —
// renamed from "Data Migration" because Import/Export/Reset aren't all
// migration operations. Import Transactions navigates to the existing
// Import module rather than duplicating it here (§15).
export default async function DataManagementPage() {
  await requireActiveProfile();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-xl font-semibold">Data Management</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import Transactions</CardTitle>
          <CardDescription>Import a bank/card statement into this Profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/imports" className={buttonVariants({ variant: "outline" })}>
            Go to Imports
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
          <CardDescription>
            Download this Profile&apos;s Transactions as a CSV file. Not a Backup — for disaster
            recovery, use Backups instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportTransactionsButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reset Ledger</CardTitle>
          <CardDescription>
            Permanently delete all data from this Ledger Instance — every Profile, not just this
            one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetLedgerDialog />
        </CardContent>
      </Card>
    </div>
  );
}
