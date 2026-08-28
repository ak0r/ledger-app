// Active-Profile context — for the Primary User, who may have more than
// one Profile in the instance: this cookie IS the source of truth for
// which Profile is active app-wide (read by requireActiveProfile() in
// authz.ts). A Normal AppUser has exactly one Profile and never needs
// this at all — requireActiveProfile() falls back to their own Profile
// regardless of cookie state. Plain module — safe to import from Server
// Components (read) and from src/server/actions/activeProfile.ts (write).
import { cookies } from "next/headers";

export const ACTIVE_PROFILE_COOKIE = "activeProfileId";

export async function readActiveProfileIdCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;
}
