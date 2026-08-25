"use server";

import { redirect } from "next/navigation";
import { db } from "../db/client";
import { requireProfileAccess } from "../authz";
import { createDemoProfileData } from "../use-cases/demo-data";

// Start with Demo Data (docs/onboarding.md §3/§4) — only reachable from
// /p/[profileId]/setup, itself only reachable right before the Profile has
// any Accounts. Atomicity is createDemoProfileData's job; this action is
// just the guard/redirect wrapper.
export async function createDemoProfileDataAndActivateAction(profileId: string): Promise<void> {
  await requireProfileAccess(profileId);
  createDemoProfileData(db, profileId);
  redirect(`/p/${profileId}`);
}
