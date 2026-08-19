"use server";

import { getFamilyDb } from "../db/family-client";
import type { MemberRow } from "../repositories/members";
import { createMemberCore } from "./members.core";
import type { ActionResult } from "./result";

export async function createMemberAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<MemberRow>> {
  return createMemberCore(getFamilyDb(familyId), input);
}
