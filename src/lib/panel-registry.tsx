import type {
  BalancesPanelConfig,
  RecentExpensesPanelConfig,
  RecentTransactionsPanelConfig,
} from "@/core";
import type { DashboardPanelRow } from "@/server/repositories/dashboardPanels";
import { NetWorthPanel } from "@/components/dashboard-panels/net-worth-panel";
import { AssetsPanel } from "@/components/dashboard-panels/assets-panel";
import { LiabilitiesPanel } from "@/components/dashboard-panels/liabilities-panel";
import { BalancesPanel } from "@/components/dashboard-panels/balances-panel";
import { RecentExpensesPanel } from "@/components/dashboard-panels/recent-expenses-panel";
import { RecentTransactionsPanel } from "@/components/dashboard-panels/recent-transactions-panel";
import { BudgetsNeedingReviewPanel } from "@/components/dashboard-panels/budgets-needing-review-panel";
import { PortfolioValuePanel } from "@/components/dashboard-panels/portfolio-value-panel";
import { MonthlySnapshotPanel } from "@/components/dashboard-panels/monthly-snapshot-panel";
import { SpendingTrendPanel } from "@/components/dashboard-panels/spending-trend-panel";
import { RecurringExpensesPanel } from "@/components/dashboard-panels/recurring-expenses-panel";
import { DailySpendingHeatmapPanel } from "@/components/dashboard-panels/daily-spending-heatmap-panel";
import { SavingsRatePanel } from "@/components/dashboard-panels/savings-rate-panel";
import { CreditCardHealthPanel } from "@/components/dashboard-panels/credit-card-health-panel";
import { BudgetHealthPanel } from "@/components/dashboard-panels/budget-health-panel";
import { AttentionPanel } from "@/components/dashboard-panels/attention-panel";

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
    case "PORTFOLIO_VALUE":
      return <PortfolioValuePanel profileId={profileId} currency={currency} />;
    case "MONTHLY_SNAPSHOT":
      return <MonthlySnapshotPanel profileId={profileId} currency={currency} />;
    case "SPENDING_TREND":
      return <SpendingTrendPanel profileId={profileId} currency={currency} />;
    case "RECURRING_EXPENSES":
      return <RecurringExpensesPanel profileId={profileId} currency={currency} />;
    case "DAILY_SPENDING_HEATMAP":
      return <DailySpendingHeatmapPanel profileId={profileId} currency={currency} />;
    case "SAVINGS_RATE":
      return <SavingsRatePanel profileId={profileId} currency={currency} />;
    case "CREDIT_CARD_HEALTH":
      return <CreditCardHealthPanel profileId={profileId} currency={currency} />;
    case "BUDGET_HEALTH":
      return <BudgetHealthPanel profileId={profileId} currency={currency} />;
    case "ATTENTION":
      return <AttentionPanel profileId={profileId} currency={currency} />;
  }
}
