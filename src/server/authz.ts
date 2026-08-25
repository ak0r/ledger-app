// Shared "is this Profile mine, or am I the Primary User" gate — used by
// every Profile-scoped Server Action and layout (2026-08-20 User
// Simplification delta). Mirrors rule #6's profileId-scoping discipline:
// a Profile that exists but isn't yours (and you're not Primary) is
// treated as inaccessible, redirecting rather than leaking existence.
import { redirect } from "next/navigation";
import { db } from "./db/client";
import { getProfile, getProfileByAppUserId } from "./use-cases/profiles";
import type { ProfileRow } from "./repositories/profiles";
import type { AppUserRow } from "./repositories/app-users";
import { getCurrentAppUser } from "./session";

export async function requireProfileAccess(
  profileId: string,
): Promise<{ appUser: AppUserRow; profile: ProfileRow }> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const profile = getProfile(db, profileId);
  const ownProfile = getProfileByAppUserId(db, appUser.id);
  if (!profile) redirect(ownProfile ? `/p/${ownProfile.id}` : "/login");

  const allowed = appUser.isPrimary || profile.appUserId === appUser.id;
  if (!allowed) redirect(ownProfile ? `/p/${ownProfile.id}` : "/login");

  return { appUser, profile };
}

// Gate for Primary-only actions/pages (create a Profile for someone else,
// reach the /profiles roster). Every AppUser has exactly one Profile
// (registration invariant), so a denied Normal AppUser always has
// somewhere real to redirect to — never a picker page, since none exists
// anymore.
export async function requirePrimaryUser(): Promise<AppUserRow> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (!appUser.isPrimary) {
    const ownProfile = getProfileByAppUserId(db, appUser.id);
    redirect(ownProfile ? `/p/${ownProfile.id}` : "/login");
  }
  return appUser;
}
