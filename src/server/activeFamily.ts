// Active-Family context (docs/v9-delta/family-concept-contract.md §6):
// URL-scoped is the source of truth (/f/[familyId]/...); this cookie is
// convenience-only, used to redirect "/" to wherever the user left off.
// Mirrors src/server/activeMember.ts one level up.
import { cookies } from "next/headers";

export const ACTIVE_FAMILY_COOKIE = "activeFamilyId";

export async function readActiveFamilyIdCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_FAMILY_COOKIE)?.value;
}
