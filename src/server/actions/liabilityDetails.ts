"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { CreditCardDetails, LoanDetails } from "../services/liabilityDetails";
import { upsertCreditCardDetailsCore, upsertLoanDetailsCore } from "./liabilityDetails.core";
import type { ActionResult } from "./result";

export async function upsertCreditCardDetailsAction(input: unknown): Promise<ActionResult<CreditCardDetails>> {
  const { profile } = await requireActiveProfile();
  const result = upsertCreditCardDetailsCore(db, { ...(input as object), profileId: profile.id });
  if (result.success) revalidatePath("/accounts");
  return result;
}

export async function upsertLoanDetailsAction(input: unknown): Promise<ActionResult<LoanDetails>> {
  const { profile } = await requireActiveProfile();
  const result = upsertLoanDetailsCore(db, { ...(input as object), profileId: profile.id });
  if (result.success) revalidatePath("/accounts");
  return result;
}
