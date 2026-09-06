import Link from "next/link";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { filterTransactions, listTransactions } from "@/server/services/transactions";
import { listDistinctTags } from "@/server/services/tags";
import { parseTransactionFilter } from "@/lib/transaction-filter";
import { applySort, parseSortState } from "@/lib/transaction-sort";
import { buildTransactionTableRows } from "@/lib/transaction-rows";
import { paginate } from "@/lib/pagination";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionTable } from "@/components/transaction-table";
import { TransactionFilterDrawer } from "@/components/transaction-filter-drawer";
import { TransactionQuickSearch } from "@/components/transaction-quick-search";
import { TransactionPaginationControls } from "@/components/transaction-pagination";
import { TransactionEditDrawer } from "@/components/transaction-edit-drawer";
import { TransactionCreateDrawer } from "@/components/transaction-create-drawer";
import { TransactionCreateTrigger } from "@/components/transaction-create-trigger";
import { StickyToolbar } from "@/components/sticky-toolbar";
import { TransactionWorkspaceProvider } from "@/components/transaction-workspace";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

const PAGE_SIZES = [20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

export default async function TransactionsPage(props: PageProps<"/transactions">) {
  const searchParams = await props.searchParams;
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);

  if (currencies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h1">Set up a Currency and Accounts first</CardTitle>
          <CardDescription>
            Head to Accounts to set up ₹ INR and create at least two Accounts before logging a
            Transaction.
          </CardDescription>
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
  const defaultCurrencyId = currencies.some((c) => c.id === profile.primaryCurrencyId)
    ? (profile.primaryCurrencyId ?? undefined)
    : undefined;
  const accounts = listAccounts(db, profile.id);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  // A Transaction needs a distinct From and To account (transactions/new's
  // own guard) — gate the entry point on the same condition so the button
  // never bounces the user straight back here (was the "New Transaction
  // doesn't open" bug: this page didn't check account count at all).
  const canCreateTransaction = accounts.length >= 2;

  // Condition-based filter (src/lib/transaction-filter.ts), serialized as a
  // single `filter` query param — replaces the old ad hoc date/account/
  // classification/tag GET form (product-polish delta plan #1).
  const asParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const filterState = parseTransactionFilter(asParam(searchParams.filter));
  const hasActiveFilters = filterState.conditions.length > 0;
  const sortState = parseSortState(asParam(searchParams.sort), asParam(searchParams.dir));
  const page = Number(asParam(searchParams.page)) || 1;
  const pageSize = PAGE_SIZES.includes(Number(asParam(searchParams.pageSize)) as 20 | 50)
    ? (Number(asParam(searchParams.pageSize)) as 20 | 50)
    : DEFAULT_PAGE_SIZE;

  const allTransactions = listTransactions(db, profile.id);
  const filtered = filterTransactions(allTransactions, accountsById, filterState);
  // Sort the entire filtered result set, not just the current page (single-
  // column, three-state — src/lib/transaction-sort.ts) — this must run
  // before `paginate` slices it, otherwise sorting could only ever reorder
  // whatever 20/50 rows happened to already be on the page.
  const transactions = applySort(filtered, accountsById, sortState);
  const { items: pageItems, total, totalPages } = paginate(transactions, page, pageSize);

  const currenciesById = new Map(currencies.map((c) => [c.id, c]));
  const rows = buildTransactionTableRows(pageItems, accountsById, currency, currenciesById);
  const existingTags = listDistinctTags(db, profile.id);
  const accountOptions = accounts.map((account) => {
    const accountCurrency = currenciesById.get(account.currencyId);
    return {
      id: account.id,
      name: account.name,
      classification: account.classification,
      icon: account.icon,
      currencyId: account.currencyId,
      currencySymbol: accountCurrency?.symbol ?? currency.symbol,
      currencyScale: accountCurrency?.minorUnitScale ?? currency.minorUnitScale,
    };
  });

  const baseHref = "/transactions";
  const pageHref = (targetPage: number, targetPageSize: number = pageSize) => {
    const params = new URLSearchParams();
    if (hasActiveFilters) params.set("filter", asParam(searchParams.filter) ?? "");
    if (sortState) {
      params.set("sort", sortState.field);
      params.set("dir", sortState.direction);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    if (targetPageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(targetPageSize));
    const query = params.toString();
    return query ? `${baseHref}?${query}` : baseHref;
  };
  // "Clear filters" only clears the filter — an active sort should survive
  // it, same as it survives a page/pageSize change above.
  const clearFiltersHref = (() => {
    if (!sortState) return baseHref;
    const params = new URLSearchParams();
    params.set("sort", sortState.field);
    params.set("dir", sortState.direction);
    return `${baseHref}?${params.toString()}`;
  })();

  return (
    <TransactionWorkspaceProvider key={rows.map((row) => row.id).join(",")}>
      <div className="flex flex-col gap-4">
        <StickyToolbar className="flex flex-wrap items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Transactions</h1>
            {canCreateTransaction ? (
              <TransactionCreateTrigger />
            ) : (
              <Link href="/accounts/new" className={buttonVariants({ variant: "outline" })}>
                Add an Account
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <TransactionFilterDrawer
              key={`filter-${JSON.stringify(filterState)}`}
              baseHref={baseHref}
              accounts={accounts}
              currency={currency}
              initialState={filterState}
              sortState={sortState}
              accountCreation={{ currencies, defaultCurrencyId, existingTags }}
            />
            <TransactionQuickSearch
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
        </StickyToolbar>

        {!canCreateTransaction && (
          <p className="text-sm text-muted-foreground">
            A Transaction needs at least two Accounts (money moves from one to another) — add one
            more Account to get started.
          </p>
        )}

        {total > 0 && (
          <p className="-mt-2 text-sm text-muted-foreground">
            {total} transaction{total === 1 ? "" : "s"}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters ? "No transactions match these filters." : "No transactions yet."}
          </p>
        ) : (
          <>
            <TransactionTable
              rows={rows}
              accounts={accountOptions}
              currencySymbol={currency.symbol}
              currencyScale={currency.minorUnitScale}
              existingTags={existingTags}
              sortState={sortState}
              sortBaseHref={baseHref}
              sortPreserve={{ filter: hasActiveFilters ? asParam(searchParams.filter) : undefined, pageSize: pageSize !== DEFAULT_PAGE_SIZE ? String(pageSize) : undefined }}
              stickyHeader
              footer={
                <TransactionPaginationControls
                  key="pagination-footer"
                  pageSize={pageSize}
                  pageSizeHrefs={Object.fromEntries(PAGE_SIZES.map((size) => [size, pageHref(1, size)]))}
                  page={page}
                  totalPages={totalPages}
                  first={pageHref(1)}
                  prev={page > 1 ? pageHref(page - 1) : null}
                  next={page < totalPages ? pageHref(page + 1) : null}
                  last={pageHref(totalPages)}
                />
              }
            />
            <TransactionEditDrawer
              rows={rows}
              accounts={accountOptions}
              existingTags={existingTags}
            />
          </>
        )}
        {canCreateTransaction && (
          <TransactionCreateDrawer
            accounts={accountOptions}
            existingTags={existingTags}
          />
        )}
      </div>
    </TransactionWorkspaceProvider>
  );
}
