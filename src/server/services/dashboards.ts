import {
  DASHBOARD_CONTEXTS,
  PANEL_DEFAULT_CONFIG,
  PANEL_DIMENSIONS_BY_KEY,
  isPanelKey,
  validateDashboardPanelPlacement,
  validatePanelConfiguration,
  type AccountOwnershipRef,
  type DashboardContext,
  type PanelConfigByKey,
  type PanelKey,
  type RecentExpensesPeriod,
} from "@/core";
import type { Db, DbOrTx } from "../persistence/client";
import { findAccountsByProfile, type AccountRow } from "../repositories/accounts";
import {
  deletePanelRow,
  findPanelById,
  findPanelsByDashboard,
  insertDashboardPanels,
  updatePanelConfiguration as updatePanelConfigurationRow,
  updatePanelPlacement,
  type DashboardPanelRow,
} from "../repositories/dashboardPanels";
import { findDashboardById, findDashboardByProfileAndContext, insertDashboard, type DashboardRow } from "../repositories/dashboards";
import { listTransactions } from "./transactions";
import { DashboardPanelValidationError, NotFoundError, PanelConfigValidationError } from "./errors";

// The exact Starter Dashboard layout (spec §5) — 6 panels in a 4-column
// Bento grid, Cards (1x1) across the top row, Lists (2x2) below. Not a
// spec requirement beyond "these six panels exist" — this implementation's
// own placement choice, freely rearrangeable by the user afterward.
const STARTER_PANEL_LAYOUT: { key: PanelKey; x: number; y: number }[] = [
  { key: "NET_WORTH", x: 0, y: 0 },
  { key: "ASSETS", x: 1, y: 0 },
  { key: "LIABILITIES", x: 2, y: 0 },
  { key: "BALANCES", x: 0, y: 1 },
  { key: "RECENT_EXPENSES", x: 2, y: 1 },
  { key: "RECENT_TRANSACTIONS", x: 0, y: 3 },
];

function buildPanelRow(dashboardId: string, key: PanelKey, x: number, y: number, now: string): DashboardPanelRow {
  return {
    id: crypto.randomUUID(),
    dashboardId,
    key,
    configuration: PANEL_DEFAULT_CONFIG[key],
    x,
    y,
    createdAt: now,
    updatedAt: now,
  };
}

export interface DashboardWithPanels {
  dashboard: DashboardRow;
  panels: DashboardPanelRow[];
}

// Dashboard names shown in the context switcher (Dashboard System Phase 1
// delta) — "Home" for Financial specifically (it's still the Homepage's
// own default context, spec §3), Spending/Income get their own plain
// context name since they have no equivalent "the app's front page" role.
const DASHBOARD_NAME_BY_CONTEXT: Record<DashboardContext, string> = {
  FINANCIAL: "Home",
  SPENDING: "Spending",
  INCOME: "Income",
};

function buildDashboardRow(profileId: string, context: DashboardContext, now: string): DashboardRow {
  return {
    id: crypto.randomUUID(),
    profileId,
    name: DASHBOARD_NAME_BY_CONTEXT[context],
    isDefault: true,
    context,
    createdAt: now,
    updatedAt: now,
  };
}

// A Dashboard must be created automatically for every new Profile — now
// one per context (Dashboard System Phase 1 delta), still called from
// both of this codebase's two Profile-creation call sites (services/
// auth.ts's registerAppUser, services/profiles.ts's createProfile), each
// inside its own transaction for atomicity. `tx` is typed DbOrTx (not Db)
// specifically so it composes into a caller's existing db.transaction()
// rather than opening a new one. Only the Financial context gets the
// Starter Panel layout — Spending/Income start empty until the user (or a
// future starter set) adds panels; returns the Financial one specifically
// so existing callers/tests that only cared about "the" Starter Dashboard
// keep working unchanged.
export function createStarterDashboard(tx: DbOrTx, profileId: string): DashboardWithPanels {
  const now = new Date().toISOString();
  let financial: DashboardWithPanels | undefined;

  for (const context of DASHBOARD_CONTEXTS) {
    const dashboard = buildDashboardRow(profileId, context, now);
    const panels =
      context === "FINANCIAL" ? STARTER_PANEL_LAYOUT.map(({ key, x, y }) => buildPanelRow(dashboard.id, key, x, y, now)) : [];
    insertDashboard(tx, dashboard);
    if (panels.length > 0) insertDashboardPanels(tx, panels);
    if (context === "FINANCIAL") financial = { dashboard, panels };
  }

  return financial!;
}

// Resolves (lazily creating all 3 Starter Dashboards, same posture as
// before this delta) the Dashboard for one context. `getDefaultDashboardWithPanels`
// below is the pre-delta Financial-only shape, kept for its existing
// callers/tests — this is the generalized version the new context tabs use.
export function getDashboardForContext(db: Db, profileId: string, context: DashboardContext): DashboardWithPanels {
  const existing = findDashboardByProfileAndContext(db, profileId, context);
  if (existing) {
    return { dashboard: existing, panels: findPanelsByDashboard(db, existing.id) };
  }
  // A Profile that predates this delta has no Dashboard rows for ANY
  // context yet (this codebase's own db/client.ts already rejects eager
  // migrate() on every boot; a lazy per-Profile check on read is the same
  // posture applied one level up) — `createStarterDashboard` creates all
  // 3 at once, so the very next lookup (any context) finds its row.
  const created = db.transaction((tx) => createStarterDashboard(tx, profileId));
  return context === "FINANCIAL" ? created : getDashboardForContext(db, profileId, context);
}

// The Homepage is the default (Financial) Dashboard for the active
// Profile (spec §3) — unchanged signature/behavior from before this
// delta, now a thin wrapper over `getDashboardForContext`.
export function getDefaultDashboardWithPanels(db: Db, profileId: string): DashboardWithPanels {
  return getDashboardForContext(db, profileId, "FINANCIAL");
}

function toAccountOwnershipRefs(accounts: readonly AccountRow[]): Map<string, AccountOwnershipRef> {
  return new Map(accounts.map((account) => [account.id, { id: account.id, profileId: account.profileId }]));
}

export interface AddPanelInput {
  profileId: string;
  dashboardId: string;
  key: string;
}

// Placed at the bottom of the grid (my own heuristic, not spec-mandated —
// the user drags it wherever afterward, Phase D). Always the panel's own
// default configuration (spec §20) — never forced open for configuration
// (spec §19).
export function addPanel(db: Db, input: AddPanelInput): DashboardPanelRow {
  const dashboard = findDashboardById(db, input.dashboardId, input.profileId);
  if (!dashboard) throw new NotFoundError(`Dashboard ${input.dashboardId} not found for profile ${input.profileId}`);

  const existingPanels = findPanelsByDashboard(db, dashboard.id);
  const y = existingPanels.reduce((maxY, panel) => {
    const height = isPanelKey(panel.key) ? PANEL_DIMENSIONS_BY_KEY[panel.key].height : 1;
    return Math.max(maxY, panel.y + height);
  }, 0);

  const violations = validateDashboardPanelPlacement(input.key, 0, y);
  if (violations.length > 0) throw new DashboardPanelValidationError(violations);

  const panel = buildPanelRow(dashboard.id, input.key as PanelKey, 0, y, new Date().toISOString());
  insertDashboardPanels(db, [panel]);
  return panel;
}

export interface RemovePanelInput {
  panelId: string;
  profileId: string;
}

// Immediate, no confirmation, no undo (spec §18) — only ever deletes the
// DashboardPanel row, never touches Accounts/Transactions/Postings.
export function removePanel(db: Db, input: RemovePanelInput): void {
  const existing = findPanelById(db, input.panelId, input.profileId);
  if (!existing) throw new NotFoundError(`Dashboard panel ${input.panelId} not found for profile ${input.profileId}`);
  deletePanelRow(db, input.panelId);
}

export interface MovePanelInput {
  panelId: string;
  profileId: string;
  x: number;
  y: number;
}

// No separate Save Layout action — one call per drop (spec §15).
export function movePanel(db: Db, input: MovePanelInput): DashboardPanelRow {
  const existing = findPanelById(db, input.panelId, input.profileId);
  if (!existing) throw new NotFoundError(`Dashboard panel ${input.panelId} not found for profile ${input.profileId}`);

  const violations = validateDashboardPanelPlacement(existing.key, input.x, input.y);
  if (violations.length > 0) throw new DashboardPanelValidationError(violations);

  const now = new Date().toISOString();
  updatePanelPlacement(db, input.panelId, { x: input.x, y: input.y, updatedAt: now });
  return { ...existing, x: input.x, y: input.y, updatedAt: now };
}

export interface UpdatePanelConfigurationInput {
  panelId: string;
  profileId: string;
  configuration: PanelConfigByKey[PanelKey];
}

// Configuration references must resolve within the Dashboard's own Profile
// (spec §22) — validated against every Account the Profile owns, same
// posture as use-cases/budgets.ts's assertScopeAndAllocationsValid.
export function updatePanelConfiguration(db: Db, input: UpdatePanelConfigurationInput): DashboardPanelRow {
  const existing = findPanelById(db, input.panelId, input.profileId);
  if (!existing) throw new NotFoundError(`Dashboard panel ${input.panelId} not found for profile ${input.profileId}`);
  if (!isPanelKey(existing.key)) throw new NotFoundError(`Dashboard panel ${input.panelId} has an unknown key`);

  const accounts = toAccountOwnershipRefs(findAccountsByProfile(db, input.profileId));
  const violations = validatePanelConfiguration(existing.key, input.profileId, input.configuration, accounts);
  if (violations.length > 0) throw new PanelConfigValidationError(violations);

  const now = new Date().toISOString();
  updatePanelConfigurationRow(db, input.panelId, { configuration: input.configuration, updatedAt: now });
  return { ...existing, configuration: input.configuration, updatedAt: now };
}

export interface ExpenseTotal {
  accountId: string;
  accountName: string;
  totalMinor: number;
}

function periodStartIso(period: RecentExpensesPeriod, today: Date): string | null {
  switch (period) {
    case "THIS_MONTH":
      return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
    case "THIS_YEAR":
      return new Date(Date.UTC(today.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
    case "ALL_TIME":
      return null;
  }
}

// Recent Expenses panel data (spec §10) — Expense Account totals for a
// period, runtime-derived from postings (never persisted, same posture as
// Budget actuals). `today` is injectable for tests, same pattern as
// listRecurringRulesWithNextDue/listBudgetsWithSummary.
export function getExpenseTotalsByPeriod(db: Db, profileId: string, period: RecentExpensesPeriod, today: Date = new Date()): ExpenseTotal[] {
  const accountsById = new Map(findAccountsByProfile(db, profileId).map((account) => [account.id, account]));
  const startIso = periodStartIso(period, today);
  const transactions = startIso ? listTransactions(db, profileId).filter((t) => t.date >= startIso) : listTransactions(db, profileId);

  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    for (const posting of transaction.postings) {
      if (posting.units <= 0) continue;
      if (accountsById.get(posting.accountId)?.classification !== "EXPENSE") continue;
      totals.set(posting.accountId, (totals.get(posting.accountId) ?? 0) + posting.units);
    }
  }

  return [...totals.entries()]
    .map(([accountId, totalMinor]) => ({ accountId, accountName: accountsById.get(accountId)!.name, totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}
