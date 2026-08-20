// Shared "is this familyId mine" gate — used by every family-scoped Server
// Action and layout (2026-08-19 Family/Application Architecture delta §7).
// Mirrors rule #6's memberId-scoping discipline one level up: the ownership
// check lives in the query itself (families.ts repository), this just
// resolves the current AppUser and bounces on missing/mismatched.
import { redirect } from "next/navigation";
import { appDb } from "./db/app-client";
import { getFamilyDb, type Db } from "./db/family-client";
import { getFamily } from "./use-cases/families";
import type { FamilyRow } from "./repositories/families";
import type { AppUserRow } from "./repositories/app-users";
import { getCurrentAppUser } from "./session";

export async function requireFamilyOwner(
  familyId: string,
): Promise<{ appUser: AppUserRow; family: FamilyRow }> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const family = getFamily(appDb, appUser.id, familyId);
  if (!family) redirect("/families");

  return { appUser, family };
}

export async function requireFamilyDb(familyId: string): Promise<Db> {
  await requireFamilyOwner(familyId);
  return getFamilyDb(familyId);
}
