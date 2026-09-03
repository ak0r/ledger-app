"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { requireActiveProfile } from "../authz";
import type { CurrencyRow } from "../repositories/currencies";
import { addCurrencyCore, createCurrencyCore } from "./currencies.core";
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
