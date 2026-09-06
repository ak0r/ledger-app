import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listPortfolioImports } from "@/server/services/portfolioImports";
import { listPortfolioAccounts } from "@/server/services/portfolioAccounts";
import { listFolios } from "@/server/services/folios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CasImportForm } from "@/components/cas-import-form";
import { EcasImportForm } from "@/components/ecas-import-form";
import { TradebookImportForm } from "@/components/tradebook-import-form";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "destructive" | "outline"> = {
  SUCCESS: "default",
  FAILED: "destructive",
  PENDING: "outline",
};

// Portfolio's own contextual import entry point (Portfolio UI/Navigation
// Model delta, 2026-09-05 §10) — CAS upload plus this domain's own import
// history. The cross-domain view (both Ledger + Portfolio) lives at
// /import-center instead.
export default async function PortfolioImportsPage() {
  const { profile } = await requireActiveProfile();
  const imports = listPortfolioImports(db, profile.id);
  const stockAccounts = listPortfolioAccounts(db, profile.id)
    .filter((account) => account.type === "STOCK")
    .map((account) => ({
      id: account.id,
      name: account.name,
      folios: listFolios(db, account.id).map((folio) => ({ id: folio.id, number: folio.number })),
    }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Portfolio Imports</h1>

      {!profile.panHash && (
        <Card className="max-w-lg">
          <CardContent className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium">No PAN set for this Profile</p>
              <p className="text-sm text-muted-foreground">
                Without it, an imported CAS can&apos;t be checked against the wrong investor.
              </p>
            </div>
            <Link
              href={`/settings/profiles/${profile.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Set PAN
            </Link>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Import CAS</CardTitle>
          <CardDescription>Upload a CAMS/KFin Consolidated Account Statement.</CardDescription>
        </CardHeader>
        <CardContent>
          <CasImportForm />
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Import eCAS</CardTitle>
          <CardDescription>Upload a demat holdings statement (NSDL/CDSL) for your equities.</CardDescription>
        </CardHeader>
        <CardContent>
          <EcasImportForm />
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Import Stock Tradebook</CardTitle>
          <CardDescription>Upload an equity delivery tradebook from your broker.</CardDescription>
        </CardHeader>
        <CardContent>
          <TradebookImportForm accounts={stockAccounts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {imports.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                    <TableCell>{row.kind}</TableCell>
                    <TableCell className="text-muted-foreground">{row.filename ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
