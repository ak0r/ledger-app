"use server";

import { revalidatePath } from "next/cache";
import { getFamilyDb } from "../db/family-client";
import type { CurrencyRow } from "../repositories/currencies";
import { createCurrencyCore } from "./currencies.core";
import type { ActionResult } from "./result";

export async function createCurrencyAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<CurrencyRow>> {
  return createCurrencyCore(getFamilyDb(familyId), input);
}

// Zero-JS: bind(null, familyId, memberId) from a plain <form>. MVP is
// INR-only (rule #7, ADR-020), so there's nothing for the user to choose —
// this seeds the one supported Currency as a single button, still a
// separate step from Member creation (resolved 2026-08-15, HANDOFF.md open
// decisions #1).
export async function createInrCurrencyAction(familyId: string, memberId: string): Promise<void> {
  const result = createCurrencyCore(getFamilyDb(familyId), {
    memberId,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  if (!result.success) throw new Error(result.error);
  revalidatePath(`/f/${familyId}/m/${memberId}/accounts`);
}
