import Link from "next/link";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/services/accounts";
import { listCurrencies } from "@/server/services/currencies";
import { listBudgetsWithSummary } from "@/server/services/budgets";
import { buttonVariants } from "@/components/ui/button";
import { BudgetList } from "@/components/budget-list";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  const accounts = listAccounts(db, profile.id);
  const summaries = listBudgetsWithSummary(db, profile.id);
  const currency = currencies[0];

  const expenseAccounts = accounts
    .filter((account) => account.classification === "EXPENSE")
    .map((account) => ({ id: account.id, name: account.name }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Budgets</h1>
        <Link href="/budgets/new" className={buttonVariants({ variant: "default" })}>
          + Create Budget
        </Link>
      </div>

      {currency && (
        <BudgetList summaries={summaries} expenseAccounts={expenseAccounts} currencySymbol={currency.symbol} currencyScale={currency.minorUnitScale} />
      )}
    </div>
  );
}
