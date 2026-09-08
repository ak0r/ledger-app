import {
  budgetPeriodWindowAt,
  nextBudgetPeriodAfter,
  validateBudget,
  validateBudgetAllocation,
  validateBudgetScope,
  type BudgetAllocationInput,
  type BudgetPeriodWindow,
  type BudgetRecurrenceSchedule,
  type BudgetScopeSnapshot,
  type BudgetType,
  type ExpenseAccountRef,
} from "@/core";
import { matchesBudgetFilter } from "@/lib/budget-filter";
import type { Db } from "../persistence/client";
import { findAccountsByProfile, type AccountRow } from "../repositories/accounts";
import {
  deleteAllocationsByPeriod,
  findAllocationsByPeriod,
  insertBudgetAllocations,
  type BudgetAllocationRow,
} from "../repositories/budgetAllocations";
import {
  deleteBudgetPeriodsByBudget,
  findBudgetPeriodById,
  findBudgetPeriodsByBudget,
  findLatestBudgetPeriod,
  insertBudgetPeriod,
  updateBudgetPeriodSnapshot,
  type BudgetPeriodRow,
} from "../repositories/budgetPeriods";
import { deleteBudgetRow, findBudgetById, findBudgetsByProfile, insertBudget, updateBudgetFields, type BudgetRow } from "../repositories/budgets";
import { listTransactions } from "./transactions";
import { BudgetAllocationValidationError, BudgetScopeValidationError, BudgetValidationError, NotFoundError } from "./errors";

function toExpenseAccountRefs(accounts: readonly AccountRow[]): Map<string, ExpenseAccountRef> {
  return new Map(accounts.map((account) => [account.id, { id: account.id, profileId: account.profileId, classification: account.classification }]));
}

function toRecurrenceSchedule(row: {
  recurrenceUnit: BudgetRow["recurrenceUnit"];
  recurrenceInterval: BudgetRow["recurrenceInterval"];
  recurrenceStartDate: BudgetRow["recurrenceStartDate"];
  recurrenceEndDate: BudgetRow["recurrenceEndDate"];
  recurrenceOccurrences: BudgetRow["recurrenceOccurrences"];
}): BudgetRecurrenceSchedule | null {
  if (!row.recurrenceUnit || row.recurrenceInterval == null || !row.recurrenceStartDate) return null;
  return {
    unit: row.recurrenceUnit,
    interval: row.recurrenceInterval,
    startDate: row.recurrenceStartDate,
    endDate: row.recurrenceEndDate,
    occurrences: row.recurrenceOccurrences,
  };
}

// Validates scope + every allocation against the domain layer before
// touching the DB (rule #17), same posture as assertValid in
// use-cases/recurring.ts. Aggregates violations across all allocations
// rather than failing on the first one, so a form can show every error at
// once.
function assertScopeAndAllocationsValid(
  db: Db,
  profileId: string,
  scope: BudgetScopeSnapshot,
  allocations: readonly BudgetAllocationInput[],
): void {
  const accounts = toExpenseAccountRefs(findAccountsByProfile(db, profileId));

  const scopeViolations = validateBudgetScope(profileId, scope.explicitAccountIds, accounts);
  if (scopeViolations.length > 0) throw new BudgetScopeValidationError(scopeViolations);

  const allocationViolations = allocations.flatMap((allocation) => validateBudgetAllocation(profileId, allocation, accounts));
  if (allocationViolations.length > 0) throw new BudgetAllocationValidationError(allocationViolations);
}

function buildAllocationRows(budgetPeriodId: string, allocations: readonly BudgetAllocationInput[], now: string): BudgetAllocationRow[] {
  return allocations.map((allocation) => ({
    id: crypto.randomUUID(),
    budgetPeriodId,
    expenseAccountId: allocation.expenseAccountId,
    targetAmountMinor: allocation.targetAmountMinor,
    createdAt: now,
    updatedAt: now,
  }));
}

export interface CreateBudgetInput {
  profileId: string;
  name: string;
  type: BudgetType;
  recurrence?: BudgetRecurrenceSchedule | null;
  scope: BudgetScopeSnapshot;
  allocations?: BudgetAllocationInput[];
}

export interface BudgetWithFirstPeriod {
  budget: BudgetRow;
  period: BudgetPeriodRow;
  allocations: BudgetAllocationRow[];
}

// Persists the Budget definition and, in the same action, its first
// approved Period (spec §20's "Approves Budget Period" step reads as part
// of the initial Create Budget flow itself — there is no prior period to
// review against, unlike subsequent periods which go through
// previewNextBudgetPeriod/approveBudgetPeriod's separate review gate).
export function createBudget(db: Db, input: CreateBudgetInput): BudgetWithFirstPeriod {
  const violations = validateBudget({
    profileId: input.profileId,
    name: input.name,
    type: input.type,
    recurrence: input.recurrence,
  });
  if (violations.length > 0) throw new BudgetValidationError(violations);

  const allocations = input.allocations ?? [];
  assertScopeAndAllocationsValid(db, input.profileId, input.scope, allocations);

  const window: BudgetPeriodWindow | null = input.recurrence ? budgetPeriodWindowAt(input.recurrence, 0) : null;

  const now = new Date().toISOString();
  const budget: BudgetRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    name: input.name,
    type: input.type,
    recurrenceUnit: input.recurrence?.unit ?? null,
    recurrenceInterval: input.recurrence?.interval ?? null,
    recurrenceStartDate: input.recurrence?.startDate ?? null,
    recurrenceEndDate: input.recurrence?.endDate ?? null,
    recurrenceOccurrences: input.recurrence?.occurrences ?? null,
    explicitAccountIds: input.scope.explicitAccountIds,
    filterMatch: input.scope.filter.match,
    filterConditions: input.scope.filter.conditions,
    createdAt: now,
    updatedAt: now,
  };
  const period: BudgetPeriodRow = {
    id: crypto.randomUUID(),
    budgetId: budget.id,
    startDate: window?.startDate ?? null,
    endDate: window?.endDate ?? null,
    scopeSnapshot: input.scope,
    createdAt: now,
    updatedAt: now,
  };
  const allocationRows = buildAllocationRows(period.id, allocations, now);

  db.transaction((tx) => {
    insertBudget(tx, budget);
    insertBudgetPeriod(tx, period);
    insertBudgetAllocations(tx, allocationRows);
  });

  return { budget, period, allocations: allocationRows };
}

export interface EditBudgetInput {
  budgetId: string;
  profileId: string;
  name: string;
  type: BudgetType;
  recurrence?: BudgetRecurrenceSchedule | null;
  scope: BudgetScopeSnapshot;
  allocations: BudgetAllocationInput[];
}

// Edits the Budget definition and syncs the *current* (latest) Period's
// scope/allocations in place — spec §10's warning gate is an
// application/UI-layer concern (the caller must have already confirmed
// it); historical Periods are never touched (spec §11.1). Recurrence
// changes only affect Periods approved after this edit — the current
// Period's already-approved start/end dates are not recomputed.
export function editBudget(db: Db, input: EditBudgetInput): BudgetRow {
  const existing = findBudgetById(db, input.budgetId, input.profileId);
  if (!existing) throw new NotFoundError(`Budget ${input.budgetId} not found for profile ${input.profileId}`);

  const violations = validateBudget({
    profileId: input.profileId,
    name: input.name,
    type: input.type,
    recurrence: input.recurrence,
  });
  if (violations.length > 0) throw new BudgetValidationError(violations);

  assertScopeAndAllocationsValid(db, input.profileId, input.scope, input.allocations);

  const now = new Date().toISOString();
  const fields = {
    name: input.name,
    type: input.type,
    recurrenceUnit: input.recurrence?.unit ?? null,
    recurrenceInterval: input.recurrence?.interval ?? null,
    recurrenceStartDate: input.recurrence?.startDate ?? null,
    recurrenceEndDate: input.recurrence?.endDate ?? null,
    recurrenceOccurrences: input.recurrence?.occurrences ?? null,
    explicitAccountIds: input.scope.explicitAccountIds,
    filterMatch: input.scope.filter.match,
    filterConditions: input.scope.filter.conditions,
    updatedAt: now,
  };

  const currentPeriod = findLatestBudgetPeriod(db, input.budgetId);
  const allocationRows = currentPeriod ? buildAllocationRows(currentPeriod.id, input.allocations, now) : [];

  db.transaction((tx) => {
    updateBudgetFields(tx, input.budgetId, input.profileId, fields);
    if (currentPeriod) {
      updateBudgetPeriodSnapshot(tx, currentPeriod.id, { scopeSnapshot: input.scope, updatedAt: now });
      deleteAllocationsByPeriod(tx, currentPeriod.id);
      insertBudgetAllocations(tx, allocationRows);
    }
  });

  return { ...existing, ...fields };
}

export interface DeleteBudgetInput {
  budgetId: string;
  profileId: string;
}

// Cascades manually — no onDelete:"cascade" on budget_periods/
// budget_allocations FKs (unlike postings->transactions), since a Budget's
// own delete is the only path that ever needs to remove a Period.
export function deleteBudget(db: Db, input: DeleteBudgetInput): void {
  const existing = findBudgetById(db, input.budgetId, input.profileId);
  if (!existing) throw new NotFoundError(`Budget ${input.budgetId} not found for profile ${input.profileId}`);

  const periods = findBudgetPeriodsByBudget(db, input.budgetId);

  db.transaction((tx) => {
    for (const period of periods) deleteAllocationsByPeriod(tx, period.id);
    deleteBudgetPeriodsByBudget(tx, input.budgetId);
    deleteBudgetRow(tx, input.budgetId, input.profileId);
  });
}

export function getBudget(db: Db, budgetId: string, profileId: string): BudgetRow | undefined {
  return findBudgetById(db, budgetId, profileId);
}

export function listBudgets(db: Db, profileId: string): BudgetRow[] {
  return findBudgetsByProfile(db, profileId);
}

export interface BudgetPeriodPreview {
  window: BudgetPeriodWindow;
  defaults: {
    scope: BudgetScopeSnapshot;
    allocations: BudgetAllocationInput[];
  };
}

// The next Period a RECURRING Budget is due for, defaulted from the latest
// approved Period (spec §5) — never persisted here. Null for a ONE_TIME
// Budget (only ever has its one Period), a Budget with no Period yet, or a
// schedule that has already terminated.
export function previewNextBudgetPeriod(db: Db, budgetId: string, profileId: string): BudgetPeriodPreview | null {
  const budget = findBudgetById(db, budgetId, profileId);
  if (!budget) throw new NotFoundError(`Budget ${budgetId} not found for profile ${profileId}`);
  const schedule = toRecurrenceSchedule(budget);
  if (!schedule) return null;

  const periods = findBudgetPeriodsByBudget(db, budgetId);
  if (periods.length === 0) return null;

  const window = nextBudgetPeriodAfter(schedule, periods.length - 1);
  if (!window) return null;

  const latest = findLatestBudgetPeriod(db, budgetId) as BudgetPeriodRow;
  const allocations = findAllocationsByPeriod(db, latest.id).map((row) => ({
    expenseAccountId: row.expenseAccountId,
    targetAmountMinor: row.targetAmountMinor,
  }));

  return { window, defaults: { scope: latest.scopeSnapshot, allocations } };
}

export interface ApproveBudgetPeriodInput {
  budgetId: string;
  profileId: string;
  startDate: string | null;
  endDate: string | null;
  scope: BudgetScopeSnapshot;
  allocations: BudgetAllocationInput[];
}

// Persists a newly-approved Period — never created silently (spec §5/§16),
// always an explicit call from a user confirming the review step. Also
// syncs the Budget's own live scope columns to match (spec's "current
// scope" is always the latest approved/edited Period's scope).
export function approveBudgetPeriod(db: Db, input: ApproveBudgetPeriodInput): BudgetPeriodRow {
  const budget = findBudgetById(db, input.budgetId, input.profileId);
  if (!budget) throw new NotFoundError(`Budget ${input.budgetId} not found for profile ${input.profileId}`);

  assertScopeAndAllocationsValid(db, input.profileId, input.scope, input.allocations);

  const now = new Date().toISOString();
  const period: BudgetPeriodRow = {
    id: crypto.randomUUID(),
    budgetId: input.budgetId,
    startDate: input.startDate,
    endDate: input.endDate,
    scopeSnapshot: input.scope,
    createdAt: now,
    updatedAt: now,
  };
  const allocationRows = buildAllocationRows(period.id, input.allocations, now);

  db.transaction((tx) => {
    insertBudgetPeriod(tx, period);
    insertBudgetAllocations(tx, allocationRows);
    updateBudgetFields(tx, input.budgetId, input.profileId, {
      name: budget.name,
      type: budget.type,
      recurrenceUnit: budget.recurrenceUnit,
      recurrenceInterval: budget.recurrenceInterval,
      recurrenceStartDate: budget.recurrenceStartDate,
      recurrenceEndDate: budget.recurrenceEndDate,
      recurrenceOccurrences: budget.recurrenceOccurrences,
      explicitAccountIds: input.scope.explicitAccountIds,
      filterMatch: input.scope.filter.match,
      filterConditions: input.scope.filter.conditions,
      updatedAt: now,
    });
  });

  return period;
}

export interface BudgetActualRow {
  expenseAccountId: string;
  targetAmountMinor: number | null;
  actualMinor: number;
}

export interface BudgetActuals {
  period: BudgetPeriodRow;
  rows: BudgetActualRow[];
  totalTargetMinor: number;
  totalActualMinor: number;
}

// Actual spending is never persisted (spec §9) — always summed at read time
// from `postings`, filtered through the Period's own frozen scope snapshot.
// A ONE_TIME Period's null start/end means no date filtering at all (spec
// §4.1). "Effective account set" (spec §6) = explicit accounts (every
// matching transaction, unconditionally) UNION filter-derived accounts
// (only the transactions that actually matched the filter) — an account
// with no allocation still gets a row if it has any actual spend (spec
// §8.2), never an invented target.
export function calculateBudgetActuals(db: Db, budgetPeriodId: string, profileId: string): BudgetActuals {
  const period = findBudgetPeriodById(db, budgetPeriodId, profileId);
  if (!period) throw new NotFoundError(`Budget period ${budgetPeriodId} not found for profile ${profileId}`);

  const accountsById = new Map<string, AccountRow>(findAccountsByProfile(db, profileId).map((account) => [account.id, account]));
  const allTransactions = listTransactions(db, profileId);
  const transactions =
    period.startDate && period.endDate
      ? allTransactions.filter((t) => t.date >= period.startDate! && t.date <= period.endDate!)
      : allTransactions;

  const { explicitAccountIds, filter } = period.scopeSnapshot;
  // matchesBudgetFilter treats zero conditions as "matches everything" (same
  // convention as transaction-filter.ts, for an unfiltered view) — here that
  // would wrongly pull in every expense account whenever no filter is
  // configured, on top of the explicit list. An empty filter must contribute
  // nothing beyond the explicit accounts, so it's only consulted when it
  // actually has conditions.
  const hasFilter = filter.conditions.length > 0;
  const actualsByAccount = new Map<string, number>();
  for (const transaction of transactions) {
    const transactionMatchesFilter = hasFilter && matchesBudgetFilter(transaction, accountsById, filter);
    for (const posting of transaction.postings) {
      if (posting.units <= 0) continue;
      if (accountsById.get(posting.accountId)?.classification !== "EXPENSE") continue;
      const included = explicitAccountIds.includes(posting.accountId) || transactionMatchesFilter;
      if (!included) continue;
      actualsByAccount.set(posting.accountId, (actualsByAccount.get(posting.accountId) ?? 0) + posting.units);
    }
  }

  const allocations = findAllocationsByPeriod(db, budgetPeriodId);
  const targetByAccount = new Map(allocations.map((a) => [a.expenseAccountId, a.targetAmountMinor]));

  const accountIds = new Set([...targetByAccount.keys(), ...actualsByAccount.keys()]);
  const rows: BudgetActualRow[] = [...accountIds].map((expenseAccountId) => ({
    expenseAccountId,
    targetAmountMinor: targetByAccount.get(expenseAccountId) ?? null,
    actualMinor: actualsByAccount.get(expenseAccountId) ?? 0,
  }));

  return {
    period,
    rows,
    totalTargetMinor: [...targetByAccount.values()].reduce((sum, value) => sum + value, 0),
    totalActualMinor: [...actualsByAccount.values()].reduce((sum, value) => sum + value, 0),
  };
}

export interface BudgetSummary {
  budget: BudgetRow;
  actuals: BudgetActuals | null;
  // True once the current Period has ended or is within
  // BUDGET_REVIEW_WINDOW_DAYS of ending, *and* a next Period actually
  // exists to review (schedule not terminated) — spec §16/§17's "ending
  // soon"/"next ready" card states, collapsed into one affordance (both
  // funnel to the same Review & Create flow). Always false for a ONE_TIME
  // Budget (only ever has its one Period).
  reviewDue: boolean;
}

// Spec §16/§17's mockups show "Ends in 5 days" as an example without
// defining the window that copy appears within — 7 days (one review cycle
// of headroom for a weekly-or-slower cadence) is this implementation's
// chosen cutoff, not a spec requirement. Approval itself is still always
// explicit either way (spec §5) — this only controls when the card *offers*
// the affordance, not whether creating the next Period is allowed.
export const BUDGET_REVIEW_WINDOW_DAYS = 7;

function daysBetween(fromIso: string, toIso: string): number {
  const msPerDay = 86_400_000;
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / msPerDay);
}

// Landing-page aggregate (spec §15.1) — one row per Budget with its current
// (latest approved) Period's actuals. `actuals` is null only for a Budget
// that somehow has no Period yet (shouldn't happen post-createBudget, but
// not a NotFoundError-worthy state either). `today` is injectable for
// tests, same pattern as listRecurringRulesWithNextDue.
export function listBudgetsWithSummary(db: Db, profileId: string, today: Date = new Date()): BudgetSummary[] {
  const todayIso = today.toISOString().slice(0, 10);
  return listBudgets(db, profileId).map((budget) => {
    const latest = findLatestBudgetPeriod(db, budget.id);
    const actuals = latest ? calculateBudgetActuals(db, latest.id, profileId) : null;

    const endDate = actuals?.period.endDate;
    const withinReviewWindow = budget.type === "RECURRING" && !!endDate && daysBetween(todayIso, endDate) <= BUDGET_REVIEW_WINDOW_DAYS;
    const reviewDue = withinReviewWindow && previewNextBudgetPeriod(db, budget.id, profileId) !== null;

    return { budget, actuals, reviewDue };
  });
}

