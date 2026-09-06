"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../persistence/client";
import { SESSION_COOKIE, getCurrentAppUser } from "../session";
import { logoutAppUser } from "../services/auth";
import type { SessionRow } from "../repositories/sessions";
import { loginCore, registerCore, updatePasswordCore } from "./auth.core";
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
  redirect("/setup");
}

// `next` must be a same-origin relative path — never trust an arbitrary
// external URL from a query param (open-redirect guard).
export async function loginAction(input: unknown, next?: string): Promise<ActionResult<void>> {
  const result = loginCore(db, input);
  if (!result.success) return result;

  await setSessionCookie(result.data.session);
  if (next && next.startsWith("/")) redirect(next);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) logoutAppUser(db, sessionId);
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function updatePasswordAction(input: unknown): Promise<ActionResult<void>> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  return updatePasswordCore(db, { ...(input as object), appUserId: appUser.id });
}
