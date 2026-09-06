"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { PortfolioAccountRow } from "../repositories/portfolioAccounts";
import { createPortfolioAccountCore } from "./portfolioAccounts.core";
import type { ActionResult } from "./result";

export async function createPortfolioAccountAction(input: unknown): Promise<ActionResult<PortfolioAccountRow>> {
  const { profile } = await requireActiveProfile();
  const result = createPortfolioAccountCore(db, { ...(input as object), profileId: profile.id });
  if (result.success) revalidatePath("/portfolio/accounts");
  return result;
}
