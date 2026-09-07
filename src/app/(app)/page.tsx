import { Suspense } from "react";
import Link from "next/link";
import { DASHBOARD_CONTEXTS, DASHBOARD_CONTEXT_LABEL, type DashboardContext } from "@/core";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { getDashboardForContext } from "@/server/services/dashboards";
import { listEligiblePanelsForContext } from "@/lib/panel-eligibility";
import { renderPanelContent } from "@/lib/panel-registry";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardGrid } from "@/components/dashboard-grid";
import { DashboardContextTabs } from "@/components/dashboard-context-tabs";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

function parseContext(raw: string | string[] | undefined): DashboardContext {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (DASHBOARD_CONTEXTS as readonly string[]).includes(value ?? "") ? (value as DashboardContext) : "FINANCIAL";
}

// The Homepage is the default (Financial) Dashboard for the active Profile
// (spec §3) — it owns no separate financial summary model of its own, it
// just renders the Dashboard's Panels
// (docs/completed/2026-09-02-Dashboard-and-Panels.md). Extended by the
// Dashboard System Phase 1 delta (2026-09-06) with Spending/Income
// contexts, switched via a `?context=` search param (URL-driven, not
// client state) — each renders its own Dashboard/panel set.
export default async function DashboardPage(props: { searchParams: Promise<{ context?: string }> }) {
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

  const searchParams = await props.searchParams;
  const context = parseContext(searchParams.context);

  const currency = currencies[0];
  const { dashboard, panels } = getDashboardForContext(db, profile.id, context);
  const eligiblePanels = listEligiblePanelsForContext(db, profile.id, context);
  const eligibilityByKey = new Map(eligiblePanels.map(({ key, eligibility }) => [key, eligibility]));
  const accounts = listAccounts(db, profile.id).map((account) => ({ id: account.id, name: account.name }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">{context === "FINANCIAL" ? "Home" : DASHBOARD_CONTEXT_LABEL[context]}</h1>
        <DashboardContextTabs active={context} />
      </div>
      <DashboardGrid
        dashboardId={dashboard.id}
        accounts={accounts}
        eligiblePanels={eligiblePanels}
        panels={panels.map((panel) => {
          // A placed panel that's since become ineligible (e.g. its one
          // Recurring Rule was deleted) never silently re-renders empty or
          // auto-removes itself — it shows why, in its own slot, until the
          // prerequisite is met again (Dashboard System Phase 1 delta §4).
          const eligibility = eligibilityByKey.get(panel.key);
          return {
            panel,
            content:
              eligibility && !eligibility.eligible ? (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                  {eligibility.reason ?? "Temporarily unavailable."}
                </div>
              ) : (
                // Suspense per panel (spec §24) — a slow/data-heavy panel
                // streams in on its own rather than blocking the whole shell.
                <Suspense fallback={<div className="h-full animate-pulse rounded-lg bg-muted" />}>
                  {renderPanelContent(panel, profile.id, { symbol: currency.symbol, minorUnitScale: currency.minorUnitScale })}
                </Suspense>
              ),
          };
        })}
      />
    </div>
  );
}
