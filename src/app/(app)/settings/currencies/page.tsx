import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CURRENCY_CATALOG } from "@/core";
import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listCurrencies } from "@/server/services/currencies";
import { AddCurrencyDialog } from "@/components/add-currency-dialog";
import { Badge } from "@/components/ui/badge";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Currencies (2026-09-03 Settings/Backup/Data Management delta §6) —
// distinguishes the Currency Catalogue (static, system-maintained; here as
// `available` for Add Currency) from this Profile's own instantiated
// Currencies (`currencies`, listed below). PRIMARY only ever refers to the
// active Profile's own primaryCurrencyId — delta §6.1: "must not imply a
// globally primary currency."
export default async function CurrenciesPage() {
  const { profile } = await requireActiveProfile();
  const currencies = listCurrencies(db, profile.id);
  const addedCodes = new Set(currencies.map((c) => c.code));
  const available = CURRENCY_CATALOG.filter((c) => !addedCodes.has(c.code));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-xl font-semibold">Currencies</h1>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Available Currencies</h2>
        <AddCurrencyDialog available={available} />
      </div>

      {currencies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Currencies yet — add one to create Accounts.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {currencies.map((currency) => (
            <li
              key={currency.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <span>
                <span className="font-mono">{currency.symbol}</span> {currency.code} —{" "}
                {currency.name}
              </span>
              {currency.id === profile.primaryCurrencyId && <Badge variant="secondary">Primary</Badge>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
