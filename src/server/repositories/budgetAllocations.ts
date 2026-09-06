import { eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { budgetAllocations } from "../persistence/schema";

export type BudgetAllocationRow = typeof budgetAllocations.$inferSelect;

export function insertBudgetAllocations(db: DbOrTx, rows: readonly BudgetAllocationRow[]): void {
  if (rows.length === 0) return;
  db.insert(budgetAllocations).values([...rows]).run();
}

// Unscoped by profileId — same posture as findPostingsByTransaction: the
// caller already resolved/validated the parent BudgetPeriod first.
export function findAllocationsByPeriod(db: DbOrTx, budgetPeriodId: string): BudgetAllocationRow[] {
  return db.select().from(budgetAllocations).where(eq(budgetAllocations.budgetPeriodId, budgetPeriodId)).all();
}

export function findAllocationsByPeriodIds(
  db: DbOrTx,
  budgetPeriodIds: readonly string[],
): BudgetAllocationRow[] {
  if (budgetPeriodIds.length === 0) return [];
  return db
    .select()
    .from(budgetAllocations)
    .where(inArray(budgetAllocations.budgetPeriodId, [...budgetPeriodIds]))
    .all();
}

// Replaces a period's allocation set wholesale — the "edit an active
// Budget's allocations" path (spec §10) always supplies the full set, same
// approach as deletePostingsByTransaction+insertPostings for editing a
// Transaction's postings.
export function deleteAllocationsByPeriod(db: DbOrTx, budgetPeriodId: string): void {
  db.delete(budgetAllocations).where(eq(budgetAllocations.budgetPeriodId, budgetPeriodId)).run();
}
