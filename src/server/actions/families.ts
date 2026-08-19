"use server";

import { cookies } from "next/headers";
import { registryDb } from "../db/registry-client";
import { evictFamilyDb } from "../db/family-client";
import { deleteFamily } from "../use-cases/families";
import { ACTIVE_FAMILY_COOKIE } from "../activeFamily";
import { ACTIVE_MEMBER_COOKIE } from "../activeMember";
import type { FamilyRow } from "../repositories/families";
import { renameFamilyCore } from "./families.core";
import { fromThrown, ok, type ActionResult } from "./result";

// Rename only — editing a Family's name must not change its dataset
// identity (docs/v9-delta/family-concept-contract.md §8.3). The registry is
// a single global database, not per-Family, so no familyId threading is
// needed to resolve which `db` to use here (unlike the financial actions).
export async function renameFamilyAction(input: unknown): Promise<ActionResult<FamilyRow>> {
  return renameFamilyCore(registryDb, input);
}

// Family deletion (product-polish pass) — real dataset removal, hard
// delete, satisfying contract §15's condition for allowing this at all (no
// soft-delete, no "hide from selector" half-measure). Registry row and
// physical dataset file are both gone after this; the active-Family/Member
// cookies are cleared only if they pointed at the Family just deleted (a
// stale cookie for some other Family must survive). No redirect() here —
// this is invoked from a ConfirmDialog's onConfirm (a click handler, not a
// <form action>), so the caller does the navigation on success, matching
// cleanUpFamilyContentAction's pattern one level up.
export async function deleteFamilyAction(familyId: string): Promise<ActionResult<void>> {
  try {
    deleteFamily(registryDb, familyId);
  } catch (error) {
    return fromThrown(error);
  }
  evictFamilyDb(familyId);

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_FAMILY_COOKIE)?.value === familyId) {
    cookieStore.delete(ACTIVE_FAMILY_COOKIE);
    cookieStore.delete(ACTIVE_MEMBER_COOKIE);
  }

  return ok(undefined);
}
