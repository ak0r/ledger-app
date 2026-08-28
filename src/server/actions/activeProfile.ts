"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_PROFILE_COOKIE } from "../activeProfile";
import { requireProfileAccess } from "../authz";

async function setActiveProfileCookie(profileId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROFILE_COOKIE, profileId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
}

// Zero-JS Profile switcher: bind(null, profileId) from a plain <form> in
// the Primary User's Profile switcher (app-header.tsx). Only the Primary
// User can switch between Profiles at all — requireProfileAccess allows
// it because Primary always has access to every Profile; a Normal AppUser
// calling this for anyone else's profileId is rejected the same way.
export async function activateProfileAction(profileId: string): Promise<void> {
  await requireProfileAccess(profileId);
  await setActiveProfileCookie(profileId);
  redirect("/");
}
