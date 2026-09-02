"use server";

import { db } from "../db/client";
import { requireActiveProfile } from "../authz";
import type { BudgetPeriodRow } from "../repositories/budgetPeriods";
import type { BudgetRow } from "../repositories/budgets";
import { approveBudgetPeriodCore, createBudgetCore, deleteBudgetCore, editBudgetCore, previewNextBudgetPeriodCore } from "./budgets.core";
import type { ActionResult } from "./result";
import type { BudgetPeriodPreview, BudgetWithFirstPeriod } from "../use-cases/budgets";

export async function createBudgetAction(input: unknown): Promise<ActionResult<BudgetWithFirstPeriod>> {
  const { profile } = await requireActiveProfile();
  return createBudgetCore(db, { ...(input as object), profileId: profile.id });
}

export async function editBudgetAction(input: unknown): Promise<ActionResult<BudgetRow>> {
  const { profile } = await requireActiveProfile();
  return editBudgetCore(db, { ...(input as object), profileId: profile.id });
}

export async function deleteBudgetAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  return deleteBudgetCore(db, { ...(input as object), profileId: profile.id });
}

export async function approveBudgetPeriodAction(input: unknown): Promise<ActionResult<BudgetPeriodRow>> {
  const { profile } = await requireActiveProfile();
  return approveBudgetPeriodCore(db, { ...(input as object), profileId: profile.id });
}

export async function previewNextBudgetPeriodAction(input: unknown): Promise<ActionResult<BudgetPeriodPreview | null>> {
  const { profile } = await requireActiveProfile();
  return previewNextBudgetPeriodCore(db, { ...(input as object), profileId: profile.id });
}
