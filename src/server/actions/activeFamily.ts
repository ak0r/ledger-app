"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { registryDb } from "../db/registry-client";
import { getFamilyDb, provisionFamilyDb } from "../db/family-client";
import { ACTIVE_FAMILY_COOKIE } from "../activeFamily";
import type { FamilyRow } from "../repositories/families";
import { resolveFamilyEntryPath } from "../onboarding";
import { createFamilyCore } from "./families.core";
import type { ActionResult } from "./result";

async function setActiveFamilyCookie(familyId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_FAMILY_COOKIE, familyId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
}

// Onboarding: create a Family (registry entry + provisioned isolated
// dataset), make it the active one, and navigate to the "how would you like
// to start" setup screen (docs/onboarding.md §3). On validation/domain
// failure, returns the ActionResult instead of redirecting so the calling
// form can show the error inline. Mirrors createMemberAndActivateAction one
// level up.
export async function createFamilyAndActivateAction(
  input: unknown,
): Promise<ActionResult<FamilyRow>> {
  const result = createFamilyCore(registryDb, input);
  if (result.success) {
    provisionFamilyDb(result.data.id);
    await setActiveFamilyCookie(result.data.id);
    redirect(`/f/${result.data.id}/setup`);
  }
  return result;
}

// Zero-JS Family switcher: bind(null, familyId) from a plain <form> in the
// Family picker. Existence is re-checked by /f/[familyId]/layout.tsx on the
// next request, so a bogus id just bounces back to "/families" — no need to
// duplicate that check here. Lands on that Family's own Primary Member
// (docs/onboarding.md §9) rather than always the Member picker — an
// explicit switch deliberately ignores any stale Member cookie from
// whichever Family was active before.
export async function activateFamilyAction(familyId: string): Promise<void> {
  await setActiveFamilyCookie(familyId);
  redirect(resolveFamilyEntryPath(getFamilyDb(familyId), familyId));
}
