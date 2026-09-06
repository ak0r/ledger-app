import Link from "next/link";
import { ChevronRight, Landmark, PieChart } from "lucide-react";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listImports } from "@/server/services/imports";
import { listPortfolioImports } from "@/server/services/portfolioImports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface ImportCenterRow {
  id: string;
  domain: "Ledger" | "Portfolio";
  filename: string;
  status: string;
  statusVariant: "default" | "destructive" | "outline";
  createdAt: string;
  href: string;
}

const LEDGER_STATUS_VARIANT: Record<string, "default" | "destructive"> = {
  successful: "default",
  failed: "destructive",
};
const PORTFOLIO_STATUS_VARIANT: Record<string, "default" | "destructive" | "outline"> = {
  SUCCESS: "default",
  FAILED: "destructive",
  PENDING: "outline",
};

// Two domain-specific entry points, not a single generic "Import" action —
// each brings in a structurally different thing (a bank statement vs. a
// CAS PDF) and has its own contextual page (§10's "both the hub AND the
// per-domain entry points"). Card-based rather than a plain button row so
// the file types each one accepts are visible before clicking in.
const ENTRY_CARDS = [
  {
    key: "ledger",
    href: "/imports/new",
    icon: Landmark,
    title: "Bank / Card Statement",
    formats: ["CSV", "XLS", "PDF"],
    description: "A bank or credit card statement. We detect the format and propose transactions to review.",
  },
  {
    key: "portfolio",
    href: "/portfolio/imports",
    icon: PieChart,
    title: "Consolidated statement",
    formats: ["CAS", "PDF"],
    description: "Mutual fund holdings from a CAMS/KFin CAS. We find the folios and build the transaction history.",
  },
] as const;

// Import Center (Portfolio UI/Navigation Model delta, 2026-09-05 §10) — a
// cross-domain application workflow, not a third domain-specific import
// page: shows both Ledger's bank-statement imports and Portfolio's CAS
// imports together, so the user can see everything needing attention or
// recently imported in one place. Contextual, domain-scoped import stays
// reachable from each domain's own "Imports" nav entry (/imports,
// /portfolio/imports) — this page never replaces those, it aggregates
// alongside them.
export default async function ImportCenterPage() {
  const { profile } = await requireActiveProfile();

  const ledgerRows: ImportCenterRow[] = listImports(db, profile.id).map((row) => ({
    id: row.id,
    domain: "Ledger",
    filename: row.filename,
    status: row.status === "successful" ? "Successful" : "Failed",
    statusVariant: LEDGER_STATUS_VARIANT[row.status] ?? "outline",
    createdAt: row.createdAt,
    href: "/imports",
  }));
  const portfolioRows: ImportCenterRow[] = listPortfolioImports(db, profile.id).map((row) => ({
    id: row.id,
    domain: "Portfolio",
    filename: row.filename ?? "—",
    status: row.status,
    statusVariant: PORTFOLIO_STATUS_VARIANT[row.status] ?? "outline",
    createdAt: row.createdAt,
    href: "/portfolio/imports",
  }));

  const rows = [...ledgerRows, ...portfolioRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const needsAttention = rows.filter((row) => row.status === "Failed" || row.status === "FAILED");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Import Center</h1>
        <p className="text-sm text-muted-foreground">What would you like to bring in?</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ENTRY_CARDS.map((entry) => (
          <Link key={entry.key} href={entry.href} className="group">
            <Card className="h-full transition-colors group-hover:bg-accent/40">
              <CardContent className="flex h-full items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <entry.icon className="size-5" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{entry.title}</span>
                    {entry.formats.map((format) => (
                      <Badge key={format} variant="outline" className="font-normal text-muted-foreground">
                        {format}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {needsAttention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Imports that failed and may need a retry.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {needsAttention.map((row) => (
              <div key={row.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {row.filename} · {row.domain}
                </span>
                <Badge variant={row.statusVariant}>{row.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Imports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.domain}-${row.id}`}>
                    <TableCell className="text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={row.href} className="text-foreground underline underline-offset-4">
                        {row.filename}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.domain}</TableCell>
                    <TableCell>
                      <Badge variant={row.statusVariant}>{row.status}</Badge>
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
