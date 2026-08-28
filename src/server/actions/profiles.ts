"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { requirePrimaryUser, requireProfileAccess } from "../authz";
import type { ProfileRow } from "../repositories/profiles";
import { createProfileCore, renameProfileCore } from "./profiles.core";
import type { ActionResult } from "./result";

// Only the Primary User creates Profiles for other people (2026-08-20 User
// Simplification delta §4) — a Normal AppUser already has exactly one
// Profile from registration, with no "add another for yourself" flow.
export async function createProfileAction(input: unknown): Promise<ActionResult<ProfileRow>> {
  await requirePrimaryUser();
  return createProfileCore(db, input);
}

// Rename reuses the same (profileId, input) shape and access gate as every
// other Profile-scoped action — the Primary User can rename any Profile, a
// Normal AppUser only their own.
export async function renameProfileAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<ProfileRow>> {
  await requireProfileAccess(profileId);
  const result = renameProfileCore(db, input);
  if (result.success) {
    revalidatePath("/", "layout");
    revalidatePath("/settings/profiles");
  }
  return result;
}
