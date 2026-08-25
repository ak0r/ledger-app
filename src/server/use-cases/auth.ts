import type { Db, DbOrTx } from "../db/client";
import { findAppUserByEmail, hasAnyAppUser, insertAppUser, type AppUserRow } from "../repositories/app-users";
import { insertSession, deleteSessionById, type SessionRow } from "../repositories/sessions";
import { findProfileById, insertProfile, setProfileAppUserId, type ProfileRow } from "../repositories/profiles";
import { hashPassword, verifyPassword } from "../security/password";
import { SESSION_TTL_MS } from "../session";
import { EmailAlreadyRegisteredError, InvalidCredentialsError } from "./errors";

export interface RegisterInput {
  email: string;
  password: string;
  // Optional: names a brand-new Profile when one is created (falls back to
  // deriveDefaultProfileName if omitted). Ignored when linking to an
  // already-named existing Profile via `profileId`.
  name?: string;
  // Present when registering via a Primary User's "Registration link"
  // (?profileId=<id> on /register) — links to that existing unlinked
  // Profile instead of creating a new one.
  profileId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

function createSession(db: DbOrTx, appUserId: string): SessionRow {
  const now = Date.now();
  const session: SessionRow = {
    id: crypto.randomUUID(),
    appUserId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  insertSession(db, session);
  return session;
}

function deriveDefaultProfileName(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

export function registerAppUser(
  db: Db,
  input: RegisterInput,
): { appUser: AppUserRow; session: SessionRow; profile: ProfileRow } {
  if (findAppUserByEmail(db, input.email)) {
    throw new EmailAlreadyRegisteredError(input.email);
  }

  const now = new Date().toISOString();
  let result!: { appUser: AppUserRow; session: SessionRow; profile: ProfileRow };

  db.transaction((tx) => {
    // The very first AppUser ever registered in this Hosted Instance
    // becomes the Primary User (2026-08-20 delta §4). Always gets a
    // brand-new Profile — the delta doesn't describe the very-first
    // registration as a linking flow, so any profileId param is ignored
    // in this specific case.
    const isFirstEver = !hasAnyAppUser(tx);

    const appUser: AppUserRow = {
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: hashPassword(input.password),
      isPrimary: isFirstEver,
      createdAt: now,
      updatedAt: now,
    };
    insertAppUser(tx, appUser);

    const linkTarget = !isFirstEver && input.profileId ? findProfileById(tx, input.profileId) : undefined;

    let profile: ProfileRow;
    if (linkTarget && !linkTarget.appUserId) {
      const updatedAt = new Date().toISOString();
      setProfileAppUserId(tx, linkTarget.id, appUser.id, updatedAt);
      profile = { ...linkTarget, appUserId: appUser.id, updatedAt };
    } else {
      // No profileId given, or a bogus/already-linked one — falls back to
      // a fresh Profile rather than erroring or silently stealing someone
      // else's.
      profile = {
        id: crypto.randomUUID(),
        name: input.name || deriveDefaultProfileName(input.email),
        appUserId: appUser.id,
        createdAt: now,
        updatedAt: now,
      };
      insertProfile(tx, profile);
    }

    result = { appUser, session: createSession(tx, appUser.id), profile };
  });

  return result;
}

export function loginAppUser(
  db: Db,
  input: LoginInput,
): { appUser: AppUserRow; session: SessionRow } {
  const appUser = findAppUserByEmail(db, input.email);
  if (!appUser || !verifyPassword(input.password, appUser.passwordHash)) {
    // Deliberately generic — doesn't reveal whether the email exists.
    throw new InvalidCredentialsError();
  }
  return { appUser, session: createSession(db, appUser.id) };
}

export function logoutAppUser(db: Db, sessionId: string): void {
  deleteSessionById(db, sessionId);
}
