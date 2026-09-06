// Real session/auth gate — unlike activeProfile.ts's convenience-only
// cookie (URL/DB re-derives it on every request regardless), this cookie
// IS the actual authentication credential, so it's backed by a real
// DB-validated session row, not just read-and-trust.
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "./persistence/client";
import { findSessionById } from "./repositories/sessions";
import { findAppUserById, type AppUserRow } from "./repositories/app-users";

export const SESSION_COOKIE = "sessionId";
// 30 days, fixed (non-sliding) — a deliberate simplification for this
// single-operator, local-first app. Not sliding-refreshed on every request:
// that would need a DB write on every authenticated GET for marginal UX
// benefit here.
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

// cache()-wrapped: with no `profileId` URL segment left to short-circuit
// re-derivation for free, requireActiveProfile()/requirePrimaryUser() may
// both run in the same request (layout + page) — this dedupes the session
// lookup to one DB hit per request instead of one per caller.
export const getCurrentAppUser = cache(async (): Promise<AppUserRow | undefined> => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return undefined;

  const session = findSessionById(db, sessionId);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return undefined;

  return findAppUserById(db, session.appUserId);
});
