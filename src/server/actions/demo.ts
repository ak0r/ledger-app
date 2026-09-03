"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { requireActiveProfile, requireProfileAccess } from "../authz";
import { listAccounts } from "../use-cases/accounts";
import { createDemoProfileData } from "../use-cases/demo-data";

// Start with Demo Data — only reachable from /setup, itself only reachable
// right before the active Profile has any Accounts. Atomicity is
// createDemoProfileData's job; this action is just the guard/redirect
// wrapper.
export async function createDemoProfileDataAndActivateAction(): Promise<void> {
  const { profile } = await requireActiveProfile();
  createDemoProfileData(db, profile.id);
  redirect("/");
}

// Manage Profiles' "Demo Setup" entry (2026-09-03 Settings/Backup/Data
// Management delta §5) — additive, never replacement: only ever seeds an
// empty Profile, exactly like /setup does, just reachable from the
// Primary-only roster for *any* Profile that has none, not only the active
// one. Silently no-ops on a Profile that already has Accounts, rather than
// throwing — the button itself only renders for eligible Profiles, so this
// is a defence against a stale page, not the primary guard.
export async function loadDemoDataForProfileAction(profileId: string): Promise<void> {
  await requireProfileAccess(profileId);
  if (listAccounts(db, profileId).length === 0) {
    createDemoProfileData(db, profileId);
  }
  revalidatePath("/settings/profiles");
}
