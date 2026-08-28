import type { Db } from "../db/client";
import type { RecurringRuleRow } from "../repositories/recurringRules";
import { createRecurringRule, deleteRecurringRule, editRecurringRule } from "../use-cases/recurring";
import { createRecurringRuleSchema, deleteRecurringRuleSchema, editRecurringRuleSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createRecurringRuleCore(db: Db, input: unknown): ActionResult<RecurringRuleRow> {
  const parsed = createRecurringRuleSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createRecurringRule(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function editRecurringRuleCore(db: Db, input: unknown): ActionResult<RecurringRuleRow> {
  const parsed = editRecurringRuleSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(editRecurringRule(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function deleteRecurringRuleCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = deleteRecurringRuleSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    deleteRecurringRule(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}
