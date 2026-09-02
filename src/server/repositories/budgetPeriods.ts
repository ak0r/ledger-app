import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { budgetPeriods, budgets } from "../db/schema";

export type BudgetPeriodRow = typeof budgetPeriods.$inferSelect;

export function insertBudgetPeriod(db: DbOrTx, row: BudgetPeriodRow): void {
  db.insert(budgetPeriods).values(row).run();
}

// Unscoped by profileId — same posture as findPostingsByTransaction
// (repositories/transactions.ts): the caller already resolved/validated
// the parent Budget via findBudgetById(db, budgetId, profileId) first.
export function findBudgetPeriodsByBudget(db: DbOrTx, budgetId: string): BudgetPeriodRow[] {
  return db
    .select()
    .from(budgetPeriods)
    .where(eq(budgetPeriods.budgetId, budgetId))
    .orderBy(desc(budgetPeriods.createdAt))
    .all();
}

export function findLatestBudgetPeriod(db: DbOrTx, budgetId: string): BudgetPeriodRow | undefined {
  return db
    .select()
    .from(budgetPeriods)
    .where(eq(budgetPeriods.budgetId, budgetId))
    .orderBy(desc(budgetPeriods.createdAt))
    .limit(1)
    .get();
}

// Profile-scoped via the `budgets` join (rule #6) — `budget_periods` itself
// carries no `profile_id` column, same convention as `account_identifiers`.
export function findBudgetPeriodById(db: DbOrTx, id: string, profileId: string): BudgetPeriodRow | undefined {
  return db
    .select({
      id: budgetPeriods.id,
      budgetId: budgetPeriods.budgetId,
      startDate: budgetPeriods.startDate,
      endDate: budgetPeriods.endDate,
      scopeSnapshot: budgetPeriods.scopeSnapshot,
      createdAt: budgetPeriods.createdAt,
      updatedAt: budgetPeriods.updatedAt,
    })
    .from(budgetPeriods)
    .innerJoin(budgets, eq(budgetPeriods.budgetId, budgets.id))
    .where(and(eq(budgetPeriods.id, id), eq(budgets.profileId, profileId)))
    .get();
}

// Only ever called from deleteBudget (use-cases/budgets.ts) — Periods
// otherwise accumulate as permanent history (spec §11), never individually
// deletable.
export function deleteBudgetPeriodsByBudget(db: DbOrTx, budgetId: string): void {
  db.delete(budgetPeriods).where(eq(budgetPeriods.budgetId, budgetId)).run();
}

// Updates a period's own scope snapshot in place — the "edit an active
// Budget's scope" path (spec §10): only ever applied to the current open
// period, historical periods are never rewritten (spec §11.1).
export function updateBudgetPeriodSnapshot(
  db: DbOrTx,
  id: string,
  fields: Pick<BudgetPeriodRow, "scopeSnapshot" | "updatedAt">,
): void {
  db.update(budgetPeriods).set(fields).where(eq(budgetPeriods.id, id)).run();
}
