"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appDb } from "../db/app-client";
import { SESSION_COOKIE } from "../session";
import { logoutAppUser } from "../use-cases/auth";
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
  const result = registerCore(appDb, input);
  if (!result.success) return result;

  await setSessionCookie(result.data.session);
  redirect("/families");
}

// `next` must be a same-origin relative path — never trust an arbitrary
// external URL from a query param (open-redirect guard).
export async function loginAction(input: unknown, next?: string): Promise<ActionResult<void>> {
  const result = loginCore(appDb, input);
  if (!result.success) return result;

  await setSessionCookie(result.data.session);
  redirect(next && next.startsWith("/") ? next : "/families");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) logoutAppUser(appDb, sessionId);
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
