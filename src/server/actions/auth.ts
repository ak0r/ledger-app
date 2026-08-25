"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db/client";
import { SESSION_COOKIE } from "../session";
import { logoutAppUser } from "../use-cases/auth";
import { getProfileByAppUserId } from "../use-cases/profiles";
import type { SessionRow } from "../repositories/sessions";
import { loginCore, registerCore } from "./auth.core";
import type { ActionResult } from "./result";

async function setSessionCookie(session: SessionRow): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(session.expiresAt),
  });
}

export async function registerAction(input: unknown): Promise<ActionResult<void>> {
  const result = registerCore(db, input);
  if (!result.success) return result;

  await setSessionCookie(result.data.session);
  redirect(`/p/${result.data.profile.id}/setup`);
}

// `next` must be a same-origin relative path — never trust an arbitrary
// external URL from a query param (open-redirect guard).
export async function loginAction(input: unknown, next?: string): Promise<ActionResult<void>> {
  const result = loginCore(db, input);
  if (!result.success) return result;

  await setSessionCookie(result.data.session);
  if (next && next.startsWith("/")) redirect(next);

  // Invariant: every AppUser has exactly one Profile (registration always
  // creates/links one transactionally) — this lookup should never miss.
  const profile = getProfileByAppUserId(db, result.data.appUser.id);
  redirect(profile ? `/p/${profile.id}` : "/login");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) logoutAppUser(db, sessionId);
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
