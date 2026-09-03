import type {
  BalancesPanelConfig,
  RecentExpensesPanelConfig,
  RecentTransactionsPanelConfig,
} from "@/domain";
import type { DashboardPanelRow } from "@/server/repositories/dashboardPanels";
import { NetWorthPanel } from "@/components/dashboard-panels/net-worth-panel";
import { AssetsPanel } from "@/components/dashboard-panels/assets-panel";
import { LiabilitiesPanel } from "@/components/dashboard-panels/liabilities-panel";
import { BalancesPanel } from "@/components/dashboard-panels/balances-panel";
import { RecentExpensesPanel } from "@/components/dashboard-panels/recent-expenses-panel";
import { RecentTransactionsPanel } from "@/components/dashboard-panels/recent-transactions-panel";
import { BudgetsNeedingReviewPanel } from "@/components/dashboard-panels/budgets-needing-review-panel";

// The Panel Registry's rendering half (spec §8) — server-only, since every
// panel component reads the database directly. Import this ONLY from a
// Server Component (page.tsx, or another server-only module); a Client
// Component that imports it would try to bundle better-sqlite3 for the
// browser. Client-safe registry metadata (name/description/category/
// dimensions/which keys are configurable) lives in domain/dashboard.ts
// instead — src/components/dashboard-grid.tsx reads that half.
export function renderPanelContent(
  panel: DashboardPanelRow,
  profileId: string,
  currency: { symbol: string; minorUnitScale: number },
) {
  switch (panel.key) {
    case "NET_WORTH":
      return <NetWorthPanel profileId={profileId} currency={currency} />;
    case "ASSETS":
      return <AssetsPanel profileId={profileId} currency={currency} />;
    case "LIABILITIES":
      return <LiabilitiesPanel profileId={profileId} currency={currency} />;
    case "BALANCES":
      return <BalancesPanel profileId={profileId} currency={currency} configuration={panel.configuration as BalancesPanelConfig} />;
    case "RECENT_EXPENSES":
      return <RecentExpensesPanel profileId={profileId} currency={currency} configuration={panel.configuration as RecentExpensesPanelConfig} />;
    case "RECENT_TRANSACTIONS":
      return (
        <RecentTransactionsPanel profileId={profileId} currency={currency} configuration={panel.configuration as RecentTransactionsPanelConfig} />
      );
    case "BUDGETS_NEEDING_REVIEW":
      return <BudgetsNeedingReviewPanel profileId={profileId} currency={currency} />;
  }
}
