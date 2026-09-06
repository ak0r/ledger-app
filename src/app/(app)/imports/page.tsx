import Link from "next/link";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listImports } from "@/server/services/imports";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { formatDate, formatMoney } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Account Resolution delta (2026-08-26) §2 — never expose accounting-
// workflow states like "Committed"/"Approved" in import history; Phase 1
// only ever writes "successful" (atomic commit, see use-cases/imports.ts).
const STATUS_LABELS: Record<string, string> = { successful: "Successful", failed: "Failed" };

export default async function ImportsPage() {
  const { profile } = await requireActiveProfile();
  const rows = listImports(db, profile.id);
  const accountsById = new Map(listAccounts(db, profile.id).map((account) => [account.id, account]));
  const currency = listCurrencies(db, profile.id)[0];

  return (
    <Card>
      {/* §2.1 — just the action section: title, short explanation, one
          primary CTA. No dashboard-style summary cards here. */}
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle as="h1">Imports</CardTitle>
          <CardDescription>
            Upload a bank statement, review the proposed transactions, and approve them.
          </CardDescription>
        </div>
        <Link href="/imports/new" className={buttonVariants()}>
          New Import
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imported</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">New Accounts</TableHead>
                <TableHead className="text-right">Inflow</TableHead>
                <TableHead className="text-right">Outflow</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                  <TableCell>{row.filename}</TableCell>
                  <TableCell>{row.accountId ? (accountsById.get(row.accountId)?.name ?? "—") : "—"}</TableCell>
                  <TableCell className="text-right">{row.transactionCount}</TableCell>
                  <TableCell className="text-right">{row.newAccountCount}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {currency ? formatMoney(row.inflowMinor, currency.symbol, currency.minorUnitScale) : row.inflowMinor}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {currency ? formatMoney(row.outflowMinor, currency.symbol, currency.minorUnitScale) : row.outflowMinor}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{STATUS_LABELS[row.status] ?? row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
