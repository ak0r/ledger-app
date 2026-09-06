"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { FolioRow } from "../repositories/folios";
import { createFolioCore } from "./folios.core";
import type { ActionResult } from "./result";

export async function createFolioAction(input: unknown): Promise<ActionResult<FolioRow>> {
  const { profile } = await requireActiveProfile();
  const result = createFolioCore(db, { ...(input as object), profileId: profile.id });
  if (result.success) revalidatePath("/portfolio/accounts");
  return result;
}
