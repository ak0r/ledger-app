import Link from "next/link";
import type { RecentTransactionsPanelConfig } from "@/core";
import { db } from "@/server/persistence/client";
import { listAccounts } from "@/server/services/accounts";
import { listTransactions } from "@/server/services/transactions";
import { formatDate, formatMoney } from "@/lib/utils";
import { TagChips } from "@/components/tag-chips";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Same Table primitive and row styling as the full Transactions list
// (src/components/transaction-table.tsx) for visual consistency, but not
// that component itself — it's tightly coupled to sorting, bulk-select,
// and split-row expansion that a small dashboard panel doesn't need.
// Fewer columns: Date/Description/Account/Amount, no Tags column (tags
// still show inline under the description, same as before).
export async function RecentTransactionsPanel({
  profileId,
  currency,
  configuration,
}: {
  profileId: string;
  currency: { symbol: string; minorUnitScale: number };
  configuration: RecentTransactionsPanelConfig;
}) {
  const transactions = listTransactions(db, profileId).slice(0, configuration.limit);

  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  }

  const accountNameById = new Map(listAccounts(db, profileId).map((a) => [a.id, a.name]));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => {
          const toPostings = transaction.postings.filter((p) => p.units > 0);
          const amount = toPostings.reduce((sum, p) => sum + p.units, 0);
          return (
            <TableRow key={transaction.id}>
              <TableCell className="py-2 whitespace-nowrap text-muted-foreground">{formatDate(transaction.date)}</TableCell>
              <TableCell className="py-2">
                <div className="flex items-center gap-2">
                  <span>{transaction.description}</span>
                  <TagChips tags={transaction.tags} />
                </div>
              </TableCell>
              <TableCell className="py-2 text-muted-foreground">
                {toPostings.map((p, i) => (
                  <span key={p.accountId}>
                    {i > 0 && ", "}
                    <Link href={`/accounts/${p.accountId}`} className="hover:underline">
                      {accountNameById.get(p.accountId) ?? "—"}
                    </Link>
                  </span>
                ))}
              </TableCell>
              <TableCell className="py-2 text-right">
                <span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(amount, currency.symbol, currency.minorUnitScale)}</span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
