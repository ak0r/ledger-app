import { notFound } from "next/navigation";
import { getFamilyDb } from "@/server/db/family-client";
import { getAccountBalances, listAccounts } from "@/server/use-cases/accounts";
import { listCurrencies } from "@/server/use-cases/currencies";
import { filterTransactions, listTransactions } from "@/server/use-cases/transactions";
import { listDistinctTags } from "@/server/use-cases/tags";
import { parseTransactionFilter } from "@/lib/transaction-filter";
import { applySort, parseSortState } from "@/lib/transaction-sort";
import { buildTransactionTableRows } from "@/lib/transaction-rows";
import { paginate } from "@/lib/pagination";
import { TransactionTable } from "@/components/transaction-table";
import { TransactionFilterDrawer } from "@/components/transaction-filter-drawer";
import { TransactionQuickSearch } from "@/components/transaction-quick-search";
import { TransactionPaginationControls } from "@/components/transaction-pagination";
import { TransactionEditDrawer } from "@/components/transaction-edit-drawer";
import { TransactionWorkspaceProvider } from "@/components/transaction-workspace";

const PAGE_SIZES = [20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

// Transactions tab (default) — same reusable TransactionTable as the
// Member-level Transactions page (docs/ledger-transaction-list-change.md),
// scoped to this Account, now with a Filter drawer (description search)
// and pagination (20/50 per page, default 20) — both new here only; the
// Member-level page stays unpaginated/unfiltered-by-description.
export default async function AccountTransactionsPage(
  props: PageProps<"/f/[familyId]/m/[memberId]/accounts/[accountId]">,
) {
  const { familyId, memberId, accountId } = await props.params;
  const searchParams = await props.searchParams;
  const db = getFamilyDb(familyId);

  const account = getAccountBalances(db, memberId).find((a) => a.id === accountId);
  if (!account) notFound();

  const currency = listCurrencies(db, memberId)[0];
  if (!currency) notFound();

  const accounts = listAccounts(db, memberId);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const asParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const filterState = parseTransactionFilter(asParam(searchParams.filter));
  const hasActiveFilters = filterState.conditions.length > 0;
  const sortState = parseSortState(asParam(searchParams.sort), asParam(searchParams.dir));
  const page = Number(asParam(searchParams.page)) || 1;
  const pageSize = PAGE_SIZES.includes(Number(asParam(searchParams.pageSize)) as 20 | 50)
    ? (Number(asParam(searchParams.pageSize)) as 20 | 50)
    : DEFAULT_PAGE_SIZE;

  // This Account's own scope is always applied on top of the user's
  // condition-based filter — not a removable/visible condition itself
  // (transaction-filter-drawer's `lockedAccountId`, plan decision #4).
  const scoped = filterTransactions(listTransactions(db, memberId), accountsById, filterState).filter(
    (transaction) => transaction.postings.some((posting) => posting.accountId === accountId),
  );
  const filtered = applySort(scoped, accountsById, sortState);
  const { items: pageItems, total, totalPages } = paginate(filtered, page, pageSize);
  const rows = buildTransactionTableRows(pageItems, accountsById, currency);
  const existingTags = listDistinctTags(db, memberId);
  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    classification: a.classification,
    currencyId: a.currencyId,
  }));

  const base = `/f/${familyId}/m/${memberId}/accounts/${accountId}`;
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
    return query ? `${base}?${query}` : base;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TransactionFilterDrawer
            key={`filter-${JSON.stringify(filterState)}`}
            baseHref={base}
            accounts={accounts}
            currency={currency}
            initialState={filterState}
            lockedAccountId={accountId}
            sortState={sortState}
          />
          <TransactionQuickSearch
            key={`search-${JSON.stringify(filterState)}`}
            baseHref={base}
            filterState={filterState}
            sortState={sortState}
          />
        </div>
        {total > 0 && (
          <p className="text-sm text-muted-foreground">
            {total} transaction{total === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hasActiveFilters ? "No transactions match this filter." : "No transactions yet for this account."}
        </p>
      ) : (
        <TransactionWorkspaceProvider key={rows.map((row) => row.id).join(",")}>
          <TransactionTable
            rows={rows}
            familyId={familyId}
            memberId={memberId}
            accounts={accountOptions}
            currencySymbol={currency.symbol}
            currencyScale={currency.minorUnitScale}
            existingTags={existingTags}
            sortState={sortState}
            sortBaseHref={base}
            sortPreserve={{ filter: hasActiveFilters ? asParam(searchParams.filter) : undefined, pageSize: pageSize !== DEFAULT_PAGE_SIZE ? String(pageSize) : undefined }}
          />

          <TransactionPaginationControls
            pageSize={pageSize}
            pageSizeHrefs={Object.fromEntries(PAGE_SIZES.map((size) => [size, pageHref(1, size)]))}
            page={page}
            totalPages={totalPages}
            first={pageHref(1)}
            prev={page > 1 ? pageHref(page - 1) : null}
            next={page < totalPages ? pageHref(page + 1) : null}
            last={pageHref(totalPages)}
          />
          <TransactionEditDrawer
            rows={rows}
            familyId={familyId}
            memberId={memberId}
            accounts={accountOptions}
            currencySymbol={currency.symbol}
            currencyScale={currency.minorUnitScale}
            existingTags={existingTags}
          />
        </TransactionWorkspaceProvider>
      )}
    </div>
  );
}
