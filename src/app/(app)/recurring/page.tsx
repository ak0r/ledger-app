import Link from "next/link";
import { db } from "@/server/db/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/use-cases/accounts";
import { listCurrencies } from "@/server/use-cases/currencies";
import { listRecurringRulesWithNextDue } from "@/server/use-cases/recurring";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { RecurringRulesTable } from "@/components/recurring-rules-table";
import { RecurringCalendar } from "@/components/recurring-calendar";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Spec §7: two tabs, Calendar and Rules, both views over the same rules —
// not separate data.
export default async function RecurringPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  const accounts = listAccounts(db, profile.id);
  const rules = listRecurringRulesWithNextDue(db, profile.id);
  const currency = currencies[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Recurring</h1>
        <Link href="/recurring/new" className={buttonVariants({ variant: "default" })}>
          + Add New
        </Link>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTab value="calendar">Calendar</TabsTab>
          <TabsTab value="rules">Rules</TabsTab>
        </TabsList>

        <TabsPanel value="calendar">
          {currency && <RecurringCalendar rules={rules} currencySymbol={currency.symbol} currencyScale={currency.minorUnitScale} />}
        </TabsPanel>

        <TabsPanel value="rules">
          {currency && (
            <RecurringRulesTable
              rules={rules}
              accounts={accounts.map((account) => ({
                id: account.id,
                name: account.name,
                classification: account.classification,
              }))}
              currencySymbol={currency.symbol}
              currencyScale={currency.minorUnitScale}
            />
          )}
        </TabsPanel>
      </Tabs>
    </div>
  );
}
