"use server";

import { db } from "../db/client";
import { requireActiveProfile } from "../authz";
import type { RecurringRuleRow } from "../repositories/recurringRules";
import { createRecurringRuleCore, deleteRecurringRuleCore, editRecurringRuleCore } from "./recurring.core";
import type { ActionResult } from "./result";

export async function createRecurringRuleAction(input: unknown): Promise<ActionResult<RecurringRuleRow>> {
  const { profile } = await requireActiveProfile();
  return createRecurringRuleCore(db, { ...(input as object), profileId: profile.id });
}

export async function editRecurringRuleAction(input: unknown): Promise<ActionResult<RecurringRuleRow>> {
  const { profile } = await requireActiveProfile();
  return editRecurringRuleCore(db, { ...(input as object), profileId: profile.id });
}

export async function deleteRecurringRuleAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  return deleteRecurringRuleCore(db, { ...(input as object), profileId: profile.id });
}
