import type { Db } from "../db/family-client";
import { getAccountBalances, type AccountWithBalance } from "./accounts";
import { listTransactions, type TransactionWithPostings } from "./transactions";

export interface DashboardSummary {
  accountBalances: AccountWithBalance[];
  totalAssets: number;
  totalLiabilities: number;
  netPosition: number;
  totalIncome: number;
  totalExpenses: number;
  recentTransactions: TransactionWithPostings[];
}

const RECENT_TRANSACTIONS_LIMIT = 5;

// Basic reports, computed read-side from ledger data only
// (docs/04-modules.md "Budgets"/"Reports": "Consume ledger data. Calculated
// spend is not source of truth.") — nothing here is persisted.
export function getDashboardSummary(db: Db, memberId: string): DashboardSummary {
  const accountBalances = getAccountBalances(db, memberId);

  const sumByClassification = (classification: string) =>
    accountBalances
      .filter((account) => account.classification === classification)
      .reduce((sum, account) => sum + account.balance, 0);

  const totalAssets = sumByClassification("ASSET");
  const totalLiabilities = sumByClassification("LIABILITY");
  const totalIncome = sumByClassification("INCOME");
  const totalExpenses = sumByClassification("EXPENSE");

  return {
    accountBalances,
    totalAssets,
    totalLiabilities,
    netPosition: totalAssets - totalLiabilities,
    totalIncome,
    totalExpenses,
    recentTransactions: listTransactions(db, memberId).slice(0, RECENT_TRANSACTIONS_LIMIT),
  };
}
