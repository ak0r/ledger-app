import { PANEL_DASHBOARD_BY_KEY, type DashboardContext, type PanelKey } from "@/core";
import type { Db } from "@/server/persistence/client";
import { listRecurringRulesWithNextDue } from "@/server/services/recurring";
import { findAccountsByProfile } from "@/server/repositories/accounts";
import { listBudgets } from "@/server/services/budgets";

// Dashboard System Phase 1 delta (2026-09-06) §4 — a panel can decline to
// be offered/rendered when its data prerequisites aren't met ("do not
// render a meaningless empty panel"). Server-only (unlike domain/
// dashboard.ts's client-safe registry metadata) since a real eligibility
// check needs a DB read — same client/server split reasoning as
// src/lib/panel-registry.tsx's own rendering half.
export interface PanelEligibility {
  eligible: boolean;
  reason?: string;
}

const ALWAYS_ELIGIBLE: PanelEligibility = { eligible: true };

function hasActiveRecurringRule(db: Db, profileId: string): boolean {
  return listRecurringRulesWithNextDue(db, profileId).some((rule) => rule.nextDue !== null);
}

function hasCreditCardAccount(db: Db, profileId: string): boolean {
  return findAccountsByProfile(db, profileId).some((account) => account.accountType === "CREDIT_CARD");
}

function hasAnyBudget(db: Db, profileId: string): boolean {
  return listBudgets(db, profileId).length > 0;
}

// Add a check here only when a panel actually needs one; every key with
// no entry falls through to the always-eligible default below —
// deliberately not pre-built for panels that don't exist yet.
const ELIGIBILITY_BY_KEY: Partial<Record<PanelKey, (db: Db, profileId: string) => PanelEligibility>> = {
  RECURRING_EXPENSES: (db, profileId) =>
    hasActiveRecurringRule(db, profileId)
      ? ALWAYS_ELIGIBLE
      : { eligible: false, reason: "Requires at least one active Recurring Rule." },
  // The delta's own worked example (§4) — "Credit Card Health requires at
  // least one account tagged as CREDIT_CARD." A real account.instrumentType
  // choice, never inferred from an account's name.
  CREDIT_CARD_HEALTH: (db, profileId) =>
    hasCreditCardAccount(db, profileId)
      ? ALWAYS_ELIGIBLE
      : { eligible: false, reason: "Requires at least one Credit Card account." },
  BUDGET_HEALTH: (db, profileId) =>
    hasAnyBudget(db, profileId) ? ALWAYS_ELIGIBLE : { eligible: false, reason: "Requires at least one Budget." },
};

export function checkPanelEligibility(db: Db, profileId: string, key: PanelKey): PanelEligibility {
  return ELIGIBILITY_BY_KEY[key]?.(db, profileId) ?? ALWAYS_ELIGIBLE;
}

export function listEligiblePanelsForContext(
  db: Db,
  profileId: string,
  context: DashboardContext,
): { key: PanelKey; eligibility: PanelEligibility }[] {
  return (Object.keys(PANEL_DASHBOARD_BY_KEY) as PanelKey[])
    .filter((key) => PANEL_DASHBOARD_BY_KEY[key] === context)
    .map((key) => ({ key, eligibility: checkPanelEligibility(db, profileId, key) }));
}
