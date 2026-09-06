import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { getDefaultDashboardWithPanels } from "@/server/services/dashboards";
import { renderPanelContent } from "@/lib/panel-registry";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardGrid } from "@/components/dashboard-grid";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// The Homepage is the default Dashboard for the active Profile (spec §3) —
// it owns no separate financial summary model of its own, it just renders
// the Dashboard's Panels (docs/completed/2026-09-02-Dashboard-and-Panels.md,
// replacing the old hardcoded getDashboardSummary layout).
export default async function DashboardPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);

  if (currencies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h1">Set up a Currency and Accounts first</CardTitle>
          <CardDescription>Head to Accounts to get started.</CardDescription>
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
  const { dashboard, panels } = getDefaultDashboardWithPanels(db, profile.id);
  const accounts = listAccounts(db, profile.id).map((account) => ({ id: account.id, name: account.name }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Home</h1>
      <DashboardGrid
        dashboardId={dashboard.id}
        accounts={accounts}
        panels={panels.map((panel) => ({
          panel,
          // Suspense per panel (spec §24) — a slow/data-heavy panel streams
          // in on its own rather than blocking the whole shell.
          content: (
            <Suspense fallback={<div className="h-full animate-pulse rounded-lg bg-muted" />}>
              {renderPanelContent(panel, profile.id, { symbol: currency.symbol, minorUnitScale: currency.minorUnitScale })}
            </Suspense>
          ),
        }))}
      />
    </div>
  );
}
