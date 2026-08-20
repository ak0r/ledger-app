// Real session/auth gate (2026-08-19 Family/Application Architecture
// delta) — unlike activeFamily.ts/activeMember.ts's convenience-only
// cookies (URL/DB re-derives those on every request regardless), this
// cookie IS the actual authentication credential, so it's backed by a real
// DB-validated session row, not just read-and-trust.
import { cookies } from "next/headers";
import { appDb } from "./db/app-client";
import { findSessionById } from "./repositories/sessions";
import { findAppUserById, type AppUserRow } from "./repositories/app-users";

export const SESSION_COOKIE = "sessionId";
// 30 days, fixed (non-sliding) — a deliberate simplification for this
// single-operator, local-first app. Not sliding-refreshed on every request:
// that would need a DB write on every authenticated GET for marginal UX
// benefit here.
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export async function getCurrentAppUser(): Promise<AppUserRow | undefined> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return undefined;

  const session = findSessionById(appDb, sessionId);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return undefined;

  return findAppUserById(appDb, session.appUserId);
}
