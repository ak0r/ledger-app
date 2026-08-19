import Link from "next/link";
import { getFamilyDb } from "@/server/db/family-client";
import { getAccountBalances } from "@/server/use-cases/accounts";
import { listCurrencies } from "@/server/use-cases/currencies";
import { listDistinctTags } from "@/server/use-cases/tags";
import { createInrCurrencyAction } from "@/server/actions/currencies";
import {
  accountFilterToParams,
  applyAccountFilter,
  hasActiveAccountFilter,
  parseAccountFilter,
} from "@/lib/account-filter";
import { applyAccountSort, parseAccountSortState } from "@/lib/account-sort";
import { Button, buttonVariants } from "@/components/ui/button";
import { AccountFormSheet } from "@/components/account-form-sheet";
import { AccountFilterDrawer } from "@/components/account-filter-drawer";
import { AccountQuickSearch } from "@/components/account-quick-search";
import { AccountBulkActionBar } from "@/components/account-bulk-action-bar";
import { AccountTable } from "@/components/account-table";
import { AccountWorkspaceProvider } from "@/components/account-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function AccountsPage(props: PageProps<"/f/[familyId]/m/[memberId]/accounts">) {
  const { familyId, memberId } = await props.params;
  const db = getFamilyDb(familyId);
  const currencies = listCurrencies(db, memberId);

  // Currency creation is a separate step from Member creation (resolved
  // 2026-08-15, HANDOFF.md open decisions #1) — an Account needs a Currency
  // to exist first, so gate account creation on it. MVP is INR-only, so
  // there's nothing to choose here — just one button.
  if (currencies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h1">Set up a Currency first</CardTitle>
          <CardDescription>
            MVP supports INR only (rule #7). Add it once, then create Accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createInrCurrencyAction.bind(null, familyId, memberId)}>
            <Button type="submit">Set up ₹ INR</Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const currency = currencies[0];
  const searchParams = await props.searchParams;
  const asParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const filterState = parseAccountFilter({
    classification: asParam(searchParams.classification),
    instrument: asParam(searchParams.instrument),
    q: asParam(searchParams.q),
  });
  const sortState = parseAccountSortState(asParam(searchParams.sort), asParam(searchParams.dir));
  const hasActiveFilters = hasActiveAccountFilter(filterState);

  const allAccounts = getAccountBalances(db, memberId);
  const filtered = applyAccountFilter(allAccounts, filterState);
  const accounts = applyAccountSort(filtered, sortState);

  const existingTags = listDistinctTags(db, memberId);
  const currencyOptions = currencies.map((c) => ({
    id: c.id,
    code: c.code,
    symbol: c.symbol,
    minorUnitScale: c.minorUnitScale,
  }));

  const baseHref = `/f/${familyId}/m/${memberId}/accounts`;
  const clearFiltersHref = (() => {
    if (!sortState) return baseHref;
    const params = new URLSearchParams({ sort: sortState.field, dir: sortState.direction });
    return `${baseHref}?${params.toString()}`;
  })();
  const sortPreserve = accountFilterToParams(filterState);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Accounts</h1>
        <AccountFormSheet
          mode="create"
          familyId={familyId}
          memberId={memberId}
          currencies={currencyOptions}
          existingTags={existingTags}
          trigger={<Button type="button">New Account</Button>}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AccountFilterDrawer
          key={`filter-${JSON.stringify(filterState)}`}
          baseHref={baseHref}
          initialState={filterState}
          sortState={sortState}
        />
        <AccountQuickSearch
          key={`search-${JSON.stringify(filterState)}`}
          baseHref={baseHref}
          filterState={filterState}
          sortState={sortState}
        />
        {hasActiveFilters && (
          <Link href={clearFiltersHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Clear filters
          </Link>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {accounts.length} account{accounts.length === 1 ? "" : "s"}
        </span>
      </div>

      {allAccounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet.</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts match these filters.</p>
      ) : (
        <AccountWorkspaceProvider key={accounts.map((a) => a.id).join(",")}>
          <AccountBulkActionBar familyId={familyId} memberId={memberId} existingTags={existingTags} />
          <AccountTable
            accounts={accounts}
            familyId={familyId}
            memberId={memberId}
            currencyCode={currency.code}
            currencySymbol={currency.symbol}
            currencyScale={currency.minorUnitScale}
            existingTags={existingTags}
            sortState={sortState}
            sortBaseHref={baseHref}
            sortPreserve={sortPreserve}
          />
        </AccountWorkspaceProvider>
      )}
    </div>
  );
}
