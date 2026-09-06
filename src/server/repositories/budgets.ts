import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { budgets } from "../persistence/schema";

export type BudgetRow = typeof budgets.$inferSelect;

export function insertBudget(db: DbOrTx, row: BudgetRow): void {
  db.insert(budgets).values(row).run();
}

// Profile-scoped (rule #6).
export function findBudgetById(db: DbOrTx, id: string, profileId: string): BudgetRow | undefined {
  return db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.profileId, profileId)))
    .get();
}

export function findBudgetsByProfile(db: DbOrTx, profileId: string): BudgetRow[] {
  return db.select().from(budgets).where(eq(budgets.profileId, profileId)).all();
}

export type EditableBudgetFields = Pick<
  BudgetRow,
  | "name"
  | "type"
  | "recurrenceUnit"
  | "recurrenceInterval"
  | "recurrenceStartDate"
  | "recurrenceEndDate"
  | "recurrenceOccurrences"
  | "explicitAccountIds"
  | "filterMatch"
  | "filterConditions"
  | "updatedAt"
>;

export function updateBudgetFields(db: DbOrTx, id: string, profileId: string, fields: EditableBudgetFields): void {
  db
    .update(budgets)
    .set(fields)
    .where(and(eq(budgets.id, id), eq(budgets.profileId, profileId)))
    .run();
}

export function deleteBudgetRow(db: DbOrTx, id: string, profileId: string): void {
  db.delete(budgets).where(and(eq(budgets.id, id), eq(budgets.profileId, profileId))).run();
}
