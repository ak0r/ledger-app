"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireProfileAccess } from "../authz";
import { cleanUpProfileContent } from "../services/cleanup";
import { fromThrown, ok, type ActionResult } from "./result";

export async function cleanUpProfileContentAction(profileId: string): Promise<ActionResult<void>> {
  await requireProfileAccess(profileId);
  try {
    cleanUpProfileContent(db, profileId);
  } catch (error) {
    return fromThrown(error);
  }
  revalidatePath("/", "layout");
  return ok(undefined);
}
