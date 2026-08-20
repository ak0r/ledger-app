"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireFamilyDb } from "../authz";
import { ACTIVE_MEMBER_COOKIE } from "../activeMember";
import { createDemoFamilyData } from "../use-cases/demo-data";

// Start with Demo Data (docs/onboarding.md §3/§4) — only reachable from
// /f/[familyId]/setup, itself only reachable right before any Member
// exists (see that page's guard). Atomicity is createDemoFamilyData's job;
// this action is just the activation/redirect wrapper, mirroring
// createFamilyAndActivateAction/createMemberAndActivateAction one level up.
export async function createDemoFamilyAndActivateAction(familyId: string): Promise<void> {
  const primaryMember = createDemoFamilyData(await requireFamilyDb(familyId));

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_MEMBER_COOKIE, primaryMember.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });

  redirect(`/f/${familyId}/m/${primaryMember.id}`);
}
