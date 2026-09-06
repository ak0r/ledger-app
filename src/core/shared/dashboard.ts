// Dashboard and Panels delta (docs/completed/2026-09-02-Dashboard-and-Panels.md).
// The Dashboard is a UI composition layer, not a financial data store
// (spec §27) — this file only knows panel *shape* (registry metadata,
// configuration types/validation, fixed grid dimensions) and Dashboard/
// DashboardPanel identity. It must not depend on React (docs/06-architecture.md)
// — the registry's "rendering component" half lives in src/lib/panel-registry.tsx.
// Actual balances/net worth/expense totals/transaction lists are always
// runtime-derived by the use-case layer, never computed or cached here.
export const PANEL_CATEGORIES = ["CARD", "LIST", "CHART"] as const;
export type PanelCategory = (typeof PANEL_CATEGORIES)[number];

// Charts stay an empty category for this delta (spec §9) — no chart panel
// keys ship yet.
//
// PORTFOLIO_VALUE (Portfolio Adoption Plan, 2026-09-05) — the first
// Investment-dependent panel this file's own earlier note excluded ("gated
// until valuation exists," docs/10-open-decisions.md), now unblocked by
// core/portfolio's Instrument/InvestmentTransaction/NAVHistory model.
// Recent Investments/Portfolio NAV stay excluded — no screen/data behind
// them yet, same "never a placeholder" rule this file already followed.
export const PANEL_KEYS = [
  "NET_WORTH",
  "ASSETS",
  "LIABILITIES",
  "BALANCES",
  "RECENT_EXPENSES",
  "RECENT_TRANSACTIONS",
  "BUDGETS_NEEDING_REVIEW",
  "PORTFOLIO_VALUE",
] as const;
export type PanelKey = (typeof PANEL_KEYS)[number];

// Panels with a real configuration form (spec §21) — Cards and Budgets
// Needing Review need none (spec: "No user configuration is required
// initially"), so the Dashboard grid's hover Configure control only shows
// for these. Plain data so a Client Component can check it directly
// without importing anything React-shaped.
export const CONFIGURABLE_PANEL_KEYS: readonly PanelKey[] = ["BALANCES", "RECENT_EXPENSES", "RECENT_TRANSACTIONS"];

export const PANEL_CATEGORY_BY_KEY: Record<PanelKey, PanelCategory> = {
  NET_WORTH: "CARD",
  ASSETS: "CARD",
  LIABILITIES: "CARD",
  BALANCES: "LIST",
  RECENT_EXPENSES: "LIST",
  RECENT_TRANSACTIONS: "LIST",
  BUDGETS_NEEDING_REVIEW: "LIST",
  PORTFOLIO_VALUE: "CARD",
};

// Registry display metadata (spec §8's name/description) kept here as
// plain data rather than in src/lib/panel-registry.tsx — the Panel
// Catalogue and the Dashboard grid's hover header both need it from a
// Client Component (src/components/dashboard-grid.tsx), which must not
// import the registry's rendering-component half (those panels read the
// database, and better-sqlite3 can't be bundled for the browser).
export const PANEL_NAME_BY_KEY: Record<PanelKey, string> = {
  NET_WORTH: "Net Worth",
  ASSETS: "Assets",
  LIABILITIES: "Liabilities",
  BALANCES: "Balances",
  RECENT_EXPENSES: "Recent Expenses",
  RECENT_TRANSACTIONS: "Recent Transactions",
  BUDGETS_NEEDING_REVIEW: "Budgets Needing Review",
  PORTFOLIO_VALUE: "Portfolio Value",
};

export const PANEL_DESCRIPTION_BY_KEY: Record<PanelKey, string> = {
  NET_WORTH: "Assets minus Liabilities.",
  ASSETS: "Total Asset balance.",
  LIABILITIES: "Total Liability balance.",
  BALANCES: "Balances for chosen accounts.",
  RECENT_EXPENSES: "Expense Account totals for a period.",
  RECENT_TRANSACTIONS: "The most recent transactions.",
  BUDGETS_NEEDING_REVIEW: "Recurring Budgets whose current period has ended or is ending soon.",
  PORTFOLIO_VALUE: "Total value across every held Instrument.",
};

export interface PanelDimensions {
  width: number;
  height: number;
}

// Fixed by the registry, never user-editable (spec §14/§26) — Cards are a
// single Bento cell, Lists take a 2x2 block. Not a spec requirement, this
// implementation's own choice of unit sizes for a coherent grid.
export const PANEL_DIMENSIONS_BY_KEY: Record<PanelKey, PanelDimensions> = {
  NET_WORTH: { width: 1, height: 1 },
  ASSETS: { width: 1, height: 1 },
  LIABILITIES: { width: 1, height: 1 },
  BALANCES: { width: 2, height: 2 },
  RECENT_EXPENSES: { width: 2, height: 2 },
  RECENT_TRANSACTIONS: { width: 2, height: 2 },
  BUDGETS_NEEDING_REVIEW: { width: 2, height: 2 },
  PORTFOLIO_VALUE: { width: 1, height: 1 },
};

// Empty-object config for panels with no user configuration (spec: Net
// Worth/Assets/Liabilities "No user configuration is required initially")
// — `Record<string, never>` rather than `{}` so an accidental stray key is
// still a type error.
export type NoPanelConfig = Record<string, never>;

export const RECENT_EXPENSES_PERIODS = ["THIS_MONTH", "THIS_YEAR", "ALL_TIME"] as const;
export type RecentExpensesPeriod = (typeof RECENT_EXPENSES_PERIODS)[number];

// Spec §10 doesn't enumerate period options for Recent Expenses beyond
// "for a selected period" (its own worked examples show "Current Month"/
// "Current Year") — This Month/This Year/All Time is this implementation's
// interpretation, not a literal spec requirement.
export interface RecentExpensesPanelConfig {
  period: RecentExpensesPeriod;
}

export const BALANCES_ACCOUNT_SCOPES = ["ALL", "SELECTED"] as const;
export type BalancesAccountScope = (typeof BALANCES_ACCOUNT_SCOPES)[number];

// A newly-added Balances panel is scope "SELECTED" with an empty
// `accountIds` (spec §10/§20: "No account selection" is a distinct state
// from "All accounts" — never silently interpreted as All).
export interface BalancesPanelConfig {
  scope: BalancesAccountScope;
  accountIds: string[];
}

export interface RecentTransactionsPanelConfig {
  limit: number;
}

export interface PanelConfigByKey {
  NET_WORTH: NoPanelConfig;
  ASSETS: NoPanelConfig;
  LIABILITIES: NoPanelConfig;
  BALANCES: BalancesPanelConfig;
  RECENT_EXPENSES: RecentExpensesPanelConfig;
  RECENT_TRANSACTIONS: RecentTransactionsPanelConfig;
  BUDGETS_NEEDING_REVIEW: NoPanelConfig;
  PORTFOLIO_VALUE: NoPanelConfig;
}

// Spec §20: added with default configuration; default must never silently
// select financial entities unless explicitly defined for that panel key.
export const PANEL_DEFAULT_CONFIG: { [K in PanelKey]: PanelConfigByKey[K] } = {
  NET_WORTH: {},
  ASSETS: {},
  LIABILITIES: {},
  BALANCES: { scope: "SELECTED", accountIds: [] },
  RECENT_EXPENSES: { period: "THIS_MONTH" },
  RECENT_TRANSACTIONS: { limit: 20 },
  BUDGETS_NEEDING_REVIEW: {},
  PORTFOLIO_VALUE: {},
};

// Deliberately not domain/transaction.ts's AccountRef (carries currencyCode,
// unneeded for ownership checks) — same reasoning as domain/budget.ts's own
// ExpenseAccountRef, minus the EXPENSE-only restriction (a Balances panel
// can reference any account, not just Expense accounts).
export interface AccountOwnershipRef {
  id: string;
  profileId: string;
}

export type PanelConfigViolation =
  | { code: "INVALID_SCOPE" }
  | { code: "ACCOUNT_NOT_FOUND"; accountId: string }
  | { code: "OWNERSHIP_MISMATCH"; accountId: string }
  | { code: "INVALID_PERIOD" }
  | { code: "INVALID_LIMIT" };

// Configuration references must resolve within the Dashboard's own Profile
// (spec §22) — same posture as validateBudgetScope's account ownership
// checks. Pure — callers look up Accounts and pass them in.
export function validatePanelConfiguration(
  key: PanelKey,
  profileId: string,
  configuration: PanelConfigByKey[PanelKey],
  accounts: ReadonlyMap<string, AccountOwnershipRef>,
): PanelConfigViolation[] {
  switch (key) {
    case "BALANCES": {
      const config = configuration as BalancesPanelConfig;
      const violations: PanelConfigViolation[] = [];
      if (!BALANCES_ACCOUNT_SCOPES.includes(config.scope)) violations.push({ code: "INVALID_SCOPE" });
      for (const accountId of config.accountIds) {
        const account = accounts.get(accountId);
        if (!account) violations.push({ code: "ACCOUNT_NOT_FOUND", accountId });
        else if (account.profileId !== profileId) violations.push({ code: "OWNERSHIP_MISMATCH", accountId });
      }
      return violations;
    }
    case "RECENT_EXPENSES": {
      const config = configuration as RecentExpensesPanelConfig;
      return RECENT_EXPENSES_PERIODS.includes(config.period) ? [] : [{ code: "INVALID_PERIOD" }];
    }
    case "RECENT_TRANSACTIONS": {
      const config = configuration as RecentTransactionsPanelConfig;
      return Number.isInteger(config.limit) && config.limit >= 1 && config.limit <= 100 ? [] : [{ code: "INVALID_LIMIT" }];
    }
    case "NET_WORTH":
    case "ASSETS":
    case "LIABILITIES":
    case "BUDGETS_NEEDING_REVIEW":
    case "PORTFOLIO_VALUE":
      return [];
  }
}

export interface DashboardInput {
  profileId: string;
  name: string;
}

export type DashboardViolation = { code: "NAME_REQUIRED" };

// Minimal — Phase 1 has no user-facing "create a Dashboard" flow (spec §4:
// multiple-Dashboard management is out of scope), only the automatic
// Starter Dashboard. Kept for the one place a name still needs validating.
export function validateDashboard(input: DashboardInput): DashboardViolation[] {
  return input.name.trim().length === 0 ? [{ code: "NAME_REQUIRED" }] : [];
}

export type DashboardPanelViolation = { code: "UNKNOWN_PANEL_KEY"; key: string } | { code: "INVALID_PLACEMENT" };

// `key` arrives as unvalidated input at the use-case boundary (client JSON,
// same posture as everywhere else in this codebase) — narrow it here
// rather than trusting a cast.
export function isPanelKey(key: string): key is PanelKey {
  return (PANEL_KEYS as readonly string[]).includes(key);
}

export function validateDashboardPanelPlacement(key: string, x: number, y: number): DashboardPanelViolation[] {
  const violations: DashboardPanelViolation[] = [];
  if (!isPanelKey(key)) violations.push({ code: "UNKNOWN_PANEL_KEY", key });
  if (!Number.isInteger(x) || x < 0 || !Number.isInteger(y) || y < 0) violations.push({ code: "INVALID_PLACEMENT" });
  return violations;
}
