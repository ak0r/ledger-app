import Link from "next/link";
import type { BalancesPanelConfig } from "@/core";
import { db } from "@/server/persistence/client";
import { getAccountBalances } from "@/server/services/accounts";
import { formatMoney, humanizeEnum } from "@/lib/utils";

// Empty state is a valid panel state (spec §23) — "No accounts selected"
// is never silently read as "All accounts" (spec §10). No inline
// "[ Configure Panel ]" button here — the Dashboard grid's own hover
// Configure control (src/components/dashboard-grid.tsx) already covers
// that action; a Server-rendered panel body can't itself open a dialog
// owned by its Client Component frame without becoming a client boundary,
// so this only surfaces a text hint instead.
export async function BalancesPanel({
  profileId,
  currency,
  configuration,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
  configuration: BalancesPanelConfig;
}) {
  const balances = getAccountBalances(db, profileId);
  const shown = configuration.scope === "ALL" ? balances : balances.filter((a) => configuration.accountIds.includes(a.id));

  if (configuration.scope === "SELECTED" && configuration.accountIds.length === 0) {
    return <p className="text-sm text-muted-foreground">No accounts selected. Use Configure to choose accounts.</p>;
  }

  if (shown.length === 0) {
    return <p className="text-sm text-muted-foreground">No accounts yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {shown.map((account) => (
        <li key={account.id} className="flex items-center justify-between text-sm">
          <Link href={`/accounts/${account.id}`} className="hover:underline">
            {account.name}
            <span className="ml-2 text-muted-foreground">{humanizeEnum(account.classification)}</span>
          </Link>
          <span className="font-mono tabular-nums">{formatMoney(account.balance, currency.symbol, currency.minorUnitScale)}</span>
        </li>
      ))}
    </ul>
  );
}
