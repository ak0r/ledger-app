// Active-Profile context — for the Primary User, who may have more than
// one Profile in the instance: URL-scoped is the source of truth
// (/p/[profileId]/...); this cookie is convenience-only, used to redirect
// "/" to wherever the user left off. A Normal AppUser has exactly one
// Profile and never needs this at all. Plain module — safe to import from
// Server Components (read) and from src/server/actions/activeProfile.ts
// (write).
import { cookies } from "next/headers";

export const ACTIVE_PROFILE_COOKIE = "activeProfileId";

export async function readActiveProfileIdCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;
}
