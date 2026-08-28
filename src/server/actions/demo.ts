"use server";

import { redirect } from "next/navigation";
import { db } from "../db/client";
import { requireActiveProfile } from "../authz";
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
