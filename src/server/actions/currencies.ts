"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { CurrencyRow } from "../repositories/currencies";
import type { CurrencyRateRow } from "../repositories/currencyRates";
import {
  addCurrencyCore,
  createCurrencyCore,
  deleteCurrencyRateCore,
  getActiveProfileBaseCurrencyCore,
  getDefaultCurrencyRateCore,
  upsertCurrencyRateCore,
  type BaseCurrencyInfo,
} from "./currencies.core";
import type { ActionResult } from "./result";

export async function createCurrencyAction(input: unknown): Promise<ActionResult<CurrencyRow>> {
  const { profile } = await requireActiveProfile();
  return createCurrencyCore(db, { ...(input as object), profileId: profile.id });
}

export async function addCurrencyAction(input: unknown): Promise<ActionResult<CurrencyRow>> {
  const { profile } = await requireActiveProfile();
  const result = addCurrencyCore(db, { ...(input as object), profileId: profile.id });
  if (result.success) {
    revalidatePath("/settings/currencies");
    revalidatePath("/settings/profiles");
  }
  return result;
}

export async function upsertCurrencyRateAction(input: unknown): Promise<ActionResult<CurrencyRateRow>> {
  const { profile } = await requireActiveProfile();
  const result = upsertCurrencyRateCore(db, { ...(input as object), profileId: profile.id });
  if (result.success) {
    revalidatePath("/settings/currencies");
  }
  return result;
}

export async function deleteCurrencyRateAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  const result = deleteCurrencyRateCore(db, { ...(input as object), profileId: profile.id });
  if (result.success) {
    revalidatePath("/settings/currencies");
  }
  return result;
}

export async function getActiveProfileBaseCurrencyAction(): Promise<ActionResult<BaseCurrencyInfo>> {
  const { profile } = await requireActiveProfile();
  return getActiveProfileBaseCurrencyCore(db, profile.id);
}

export async function getDefaultCurrencyRateAction(input: unknown): Promise<ActionResult<{ rateDecimal: number }>> {
  const { profile } = await requireActiveProfile();
  return getDefaultCurrencyRateCore(db, { ...(input as object), profileId: profile.id });
}

// Zero-JS: bind-free plain <form>. MVP is INR-only (rule #7, ADR-020), so
// there's nothing for the user to choose — this seeds the one supported
// Currency as a single button, still a separate step from Profile creation
// (resolved 2026-08-15, HANDOFF.md open decisions #1).
export async function createInrCurrencyAction(): Promise<void> {
  const { profile } = await requireActiveProfile();
  const result = createCurrencyCore(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  if (!result.success) throw new Error(result.error);
  revalidatePath("/accounts");
}
