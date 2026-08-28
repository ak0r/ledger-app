import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { recurringRules } from "../db/schema";

export type RecurringRuleRow = typeof recurringRules.$inferSelect;

export function insertRecurringRule(db: DbOrTx, row: RecurringRuleRow): void {
  db.insert(recurringRules).values(row).run();
}

// Profile-scoped (rule #6).
export function findRecurringRuleById(
  db: DbOrTx,
  id: string,
  profileId: string,
): RecurringRuleRow | undefined {
  return db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.profileId, profileId)))
    .get();
}

export function findRecurringRulesByProfile(db: DbOrTx, profileId: string): RecurringRuleRow[] {
  return db.select().from(recurringRules).where(eq(recurringRules.profileId, profileId)).all();
}

export type EditableRecurringRuleFields = Pick<
  RecurringRuleRow,
  | "name"
  | "fromAccountId"
  | "toAccountId"
  | "amountMinor"
  | "description"
  | "frequency"
  | "interval"
  | "byMonthDay"
  | "byWeekday"
  | "startDate"
  | "endDate"
  | "updatedAt"
>;

export function updateRecurringRuleFields(
  db: DbOrTx,
  id: string,
  profileId: string,
  fields: EditableRecurringRuleFields,
): void {
  db
    .update(recurringRules)
    .set(fields)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.profileId, profileId)))
    .run();
}

export function deleteRecurringRuleRow(db: DbOrTx, id: string, profileId: string): void {
  db.delete(recurringRules).where(and(eq(recurringRules.id, id), eq(recurringRules.profileId, profileId))).run();
}
