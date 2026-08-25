"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { requireProfileAccess } from "../authz";
import type { CurrencyRow } from "../repositories/currencies";
import { createCurrencyCore } from "./currencies.core";
import type { ActionResult } from "./result";

export async function createCurrencyAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<CurrencyRow>> {
  await requireProfileAccess(profileId);
  return createCurrencyCore(db, input);
}

// Zero-JS: bind(null, profileId) from a plain <form>. MVP is INR-only
// (rule #7, ADR-020), so there's nothing for the user to choose — this
// seeds the one supported Currency as a single button, still a separate
// step from Profile creation (resolved 2026-08-15, HANDOFF.md open
// decisions #1).
export async function createInrCurrencyAction(profileId: string): Promise<void> {
  await requireProfileAccess(profileId);
  const result = createCurrencyCore(db, {
    profileId,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  if (!result.success) throw new Error(result.error);
  revalidatePath(`/p/${profileId}/accounts`);
}
