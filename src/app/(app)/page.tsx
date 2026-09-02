import Link from "next/link";
import { db } from "@/server/db/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/use-cases/accounts";
import { listCurrencies } from "@/server/use-cases/currencies";
import { getDashboardSummary } from "@/server/use-cases/dashboard";
import { listBudgetsWithSummary } from "@/server/use-cases/budgets";
import { formatDate, formatMoney, humanizeEnum } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { TagChips } from "@/components/tag-chips";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetPeriodReviewSheet } from "@/components/budget-period-review-sheet";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Basic reports, computed read-side from ledger data only (Phase 9,
// docs/11-implementation-plan.md) — account balances, net position,
// income, expenses, recent transactions (docs/08-ui-principles.md).
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
  const money = (amount: number) => formatMoney(amount, currency.symbol, currency.minorUnitScale);
  const summary = getDashboardSummary(db, profile.id);
  const accountNameById = new Map(summary.accountBalances.map((a) => [a.id, a.name]));

  // Spec §17 — surfaces Recurring Budgets whose current Period has ended or
  // is within the review window (listBudgetsWithSummary's `reviewDue`,
  // use-cases/budgets.ts), so a gap never opens silently while still
  // requiring explicit approval (spec §5). Omitted entirely when nothing
  // needs attention, rather than an always-present empty state.
  const budgetsNeedingReview = listBudgetsWithSummary(db, profile.id).filter((s) => s.reviewDue);
  const expenseAccounts = listAccounts(db, profile.id)
    .filter((account) => account.classification === "EXPENSE")
    .map((account) => ({ id: account.id, name: account.name }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      {/* Net position leads as the primary figure (docs/design/design.md
          §6 recommended hierarchy: Net Worth -> Income/Expenses ->
          Accounts). Restrained, not a hero-metric treatment — one size
          step up from the secondary row below, per §3.4. */}
      <Card>
        <CardHeader>
          <CardDescription>Net position</CardDescription>
          <CardTitle className="font-mono text-2xl tabular-nums">{money(summary.netPosition)}</CardTitle>
        </CardHeader>
      </Card>

      {budgetsNeedingReview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Budgets needing review</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {budgetsNeedingReview.map(({ budget, actuals }) => (
              <div key={budget.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{budget.name}</p>
                  <p className="text-muted-foreground">
                    {actuals?.period.endDate ? <>Ends {formatDate(actuals.period.endDate)}</> : "Ready for review"}
                  </p>
                </div>
                <BudgetPeriodReviewSheet
                  budgetId={budget.id}
                  budgetName={budget.name}
                  expenseAccounts={expenseAccounts}
                  currencySymbol={currency.symbol}
                  currencyScale={currency.minorUnitScale}
                  trigger={
                    <Button type="button" size="sm">
                      Review
                    </Button>
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Assets</CardDescription>
            <CardTitle className="font-mono tabular-nums">{money(summary.totalAssets)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Income</CardDescription>
            <CardTitle className="font-mono tabular-nums text-positive">{money(summary.totalIncome)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Expenses</CardDescription>
            <CardTitle className="font-mono tabular-nums">{money(summary.totalExpenses)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account balances</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.accountBalances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No accounts yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.accountBalances.map((account) => (
                <li key={account.id} className="flex items-center justify-between text-sm">
                  <span>
                    {account.name}
                    {/* Plain muted text, not classification-colored — see
                        account-table.tsx's matching comment. */}
                    <span className="ml-2 text-muted-foreground">
                      {humanizeEnum(account.classification)}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums">{money(account.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {summary.recentTransactions.map((transaction) => {
                const toPostings = transaction.postings.filter((p) => p.debit > 0);
                const amount = toPostings.reduce((sum, p) => sum + p.debit, 0);
                const to = toPostings
                  .map((p) => accountNameById.get(p.accountId) ?? "—")
                  .join(", ");
                return (
                  <li key={transaction.id} className="flex flex-col gap-0.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span>
                        {transaction.date} — {transaction.description}
                      </span>
                      <span className="font-mono tabular-nums">{money(amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>To: {to}</span>
                      <TagChips tags={transaction.tags} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
