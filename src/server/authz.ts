// Shared "is this Profile mine, or am I the Primary User" gate — used by
// every Profile-scoped Server Action and layout (2026-08-20 User
// Simplification delta). Mirrors rule #6's profileId-scoping discipline:
// a Profile that exists but isn't yours (and you're not Primary) is
// treated as inaccessible, redirecting rather than leaking existence.
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./persistence/client";
import { getProfile, getProfileByAppUserId } from "./services/profiles";
import type { ProfileRow } from "./repositories/profiles";
import type { AppUserRow } from "./repositories/app-users";
import { getCurrentAppUser } from "./session";
import { readActiveProfileIdCookie } from "./activeProfile";

// For the handful of actions/pages that address a Profile *other than*
// whichever one is currently active (switching to it, or a Primary User
// editing/cleaning up an arbitrary Profile from the /settings/profiles
// admin roster) — a genuine explicit resource id, not app-level context.
export async function requireProfileAccess(
  profileId: string,
): Promise<{ appUser: AppUserRow; profile: ProfileRow }> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const profile = getProfile(db, profileId);
  const ownProfile = getProfileByAppUserId(db, appUser.id);
  if (!profile) redirect(ownProfile ? "/" : "/login");

  const allowed = appUser.isPrimary || profile.appUserId === appUser.id;
  if (!allowed) redirect(ownProfile ? "/" : "/login");

  return { appUser, profile };
}

// The active-Profile gate — Profile is application-level context (a cookie,
// not a URL segment), so every page/layout that needs "the" current Profile
// calls this independently rather than trusting a parent layout to have
// already validated a URL param that no longer exists. cache()-wrapped so
// a layout + its page calling this in the same request cost one DB lookup.
export const requireActiveProfile = cache(
  async (): Promise<{ appUser: AppUserRow; profile: ProfileRow }> => {
    const appUser = await getCurrentAppUser();
    if (!appUser) redirect("/login");

    const ownProfile = getProfileByAppUserId(db, appUser.id);
    const activeId = await readActiveProfileIdCookie();
    const candidate = (activeId && getProfile(db, activeId)) || ownProfile;
    if (!candidate) redirect("/login");

    const allowed = appUser.isPrimary || candidate.appUserId === appUser.id;
    const profile = allowed ? candidate : ownProfile;
    if (!profile) redirect("/login");

    return { appUser, profile };
  },
);

// Gate for Primary-only actions/pages (create a Profile for someone else,
// reach the /settings/profiles roster). Every AppUser has exactly one
// Profile (registration invariant), so a denied Normal AppUser always has
// somewhere real to redirect to — `/`, which requireActiveProfile() then
// resolves to their own Profile.
export async function requirePrimaryUser(): Promise<AppUserRow> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (!appUser.isPrimary) redirect("/");
  return appUser;
}
