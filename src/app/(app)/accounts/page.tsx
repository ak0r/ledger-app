import Link from "next/link";
import { db } from "@/server/db/client";
import { requireActiveProfile } from "@/server/authz";
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

export default async function AccountsPage(props: PageProps<"/accounts">) {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);

  // Currency creation is a separate step from Profile creation (resolved
  // 2026-08-15, HANDOFF.md open decisions #1) — an Account needs a Currency
  // to exist first, so gate account creation on it. ₹ INR stays the fast
  // path (still the overwhelmingly common case); Settings > Currencies
  // (2026-09-03 delta §6) is where any other Currency Catalogue code gets
  // picked instead.
  if (currencies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h1">Set up a Currency first</CardTitle>
          <CardDescription>Add a Currency once, then create Accounts.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <form action={createInrCurrencyAction}>
            <Button type="submit">Set up ₹ INR</Button>
          </form>
          <Link href="/settings/currencies" className={buttonVariants({ variant: "outline" })}>
            Choose a different currency
          </Link>
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

  const allAccounts = getAccountBalances(db, profile.id);
  const filtered = applyAccountFilter(allAccounts, filterState);
  const accounts = applyAccountSort(filtered, sortState);

  const existingTags = listDistinctTags(db, profile.id);
  const currencyOptions = currencies.map((c) => ({
    id: c.id,
    code: c.code,
    symbol: c.symbol,
    minorUnitScale: c.minorUnitScale,
  }));
  const defaultCurrencyId = currencies.some((c) => c.id === profile.primaryCurrencyId)
    ? (profile.primaryCurrencyId ?? undefined)
    : undefined;

  const baseHref = "/accounts";
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
          currencies={currencyOptions}
          defaultCurrencyId={defaultCurrencyId}
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
      </div>

      {/* Same position/typography as Transactions' own list-count line
          (product-polish pass) — one consistent treatment for list counts
          across pages, not per-page ad hoc placement. */}
      {allAccounts.length > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {accounts.length} account{accounts.length === 1 ? "" : "s"}
        </p>
      )}

      {allAccounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet.</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts match these filters.</p>
      ) : (
        <AccountWorkspaceProvider key={accounts.map((a) => a.id).join(",")}>
          <AccountBulkActionBar existingTags={existingTags} />
          <AccountTable
            accounts={accounts}
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
