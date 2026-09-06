import type { Db } from "../persistence/client";
import type { BudgetPeriodRow } from "../repositories/budgetPeriods";
import type { BudgetRow } from "../repositories/budgets";
import {
  approveBudgetPeriod,
  createBudget,
  deleteBudget,
  editBudget,
  previewNextBudgetPeriod,
  type BudgetPeriodPreview,
  type BudgetWithFirstPeriod,
} from "../services/budgets";
import {
  approveBudgetPeriodSchema,
  createBudgetSchema,
  deleteBudgetSchema,
  editBudgetSchema,
  previewNextBudgetPeriodSchema,
} from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createBudgetCore(db: Db, input: unknown): ActionResult<BudgetWithFirstPeriod> {
  const parsed = createBudgetSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createBudget(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function editBudgetCore(db: Db, input: unknown): ActionResult<BudgetRow> {
  const parsed = editBudgetSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(editBudget(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function deleteBudgetCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = deleteBudgetSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    deleteBudget(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}

export function previewNextBudgetPeriodCore(db: Db, input: unknown): ActionResult<BudgetPeriodPreview | null> {
  const parsed = previewNextBudgetPeriodSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(previewNextBudgetPeriod(db, parsed.data.budgetId, parsed.data.profileId));
  } catch (error) {
    return fromThrown(error);
  }
}

export function approveBudgetPeriodCore(db: Db, input: unknown): ActionResult<BudgetPeriodRow> {
  const parsed = approveBudgetPeriodSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(approveBudgetPeriod(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}
