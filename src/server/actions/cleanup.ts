"use server";

import { revalidatePath } from "next/cache";
import { requireFamilyDb } from "../authz";
import { cleanUpFamilyContent } from "../use-cases/cleanup";
import { fromThrown, ok, type ActionResult } from "./result";

export async function cleanUpFamilyContentAction(familyId: string): Promise<ActionResult<void>> {
  try {
    cleanUpFamilyContent(await requireFamilyDb(familyId));
  } catch (error) {
    return fromThrown(error);
  }
  revalidatePath(`/f/${familyId}`, "layout");
  return ok(undefined);
}
