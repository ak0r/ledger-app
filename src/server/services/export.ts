import { fromMinorUnits } from "@/core";
import type { Db } from "../persistence/client";
import { findAccountsByProfile } from "../repositories/accounts";
import { listTransactions } from "./transactions";
import { listCurrencies } from "./currencies";

const CSV_HEADER = ["Date", "Description", "Account", "Direction", "Amount", "Currency", "Tags"];

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Export Data (2026-09-03 Settings/Backup/Data Management delta §16) — a
// minimal Transaction CSV, one row per Posting rather than per Transaction:
// the domain stays generic N-posting (rule #16), so a split/multi-leg
// Transaction has no single "the account" to put in one row without
// losing legs. Explicitly not a Backup (§16: "Export -> Portability... vs
// Backup -> Disaster recovery, whole instance") — scoped to the active
// Profile only, human-readable amounts (decimal, not raw minor units).
export function exportTransactionsCsv(db: Db, profileId: string): string {
  const transactions = listTransactions(db, profileId);
  const accounts = findAccountsByProfile(db, profileId);
  const currencies = listCurrencies(db, profileId);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const currencyById = new Map(currencies.map((currency) => [currency.id, currency]));

  const rows = transactions.flatMap((transaction) =>
    transaction.postings.map((posting) => {
      const account = accountById.get(posting.accountId);
      const currency = account ? currencyById.get(account.currencyId) : undefined;
      const isDebit = posting.units > 0;
      const scale = currency?.minorUnitScale ?? 2;
      const amount = fromMinorUnits(Math.abs(posting.units), scale).toFixed(scale);
      return [
        transaction.date,
        transaction.description,
        account?.name ?? posting.accountId,
        isDebit ? "Debit" : "Credit",
        amount,
        currency?.code ?? "",
        (transaction.tags ?? []).join(";"),
      ];
    }),
  );

  return [CSV_HEADER, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
