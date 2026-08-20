"use server";

import { revalidatePath } from "next/cache";
import { requireFamilyDb } from "../authz";
import type { MemberRow } from "../repositories/members";
import { DEFAULT_MEMBER_NAME } from "../use-cases/members";
import { createMemberCore } from "./members.core";
import type { ActionResult } from "./result";

export async function createMemberAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<MemberRow>> {
  return createMemberCore(await requireFamilyDb(familyId), input);
}

// Zero-JS one-click quick-start: bind(null, familyId) from a plain <form>
// on the Start-from-Scratch step, alongside the regular MemberForm — helps
// a new AppUser visualize the app without typing a name (2026-08-19 Family/
// Application Architecture delta).
export async function createDefaultMemberAction(familyId: string): Promise<void> {
  const db = await requireFamilyDb(familyId);
  const result = createMemberCore(db, { name: DEFAULT_MEMBER_NAME });
  if (!result.success) throw new Error(result.error);
  revalidatePath(`/f/${familyId}/members`);
}
