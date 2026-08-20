import type { AppDb } from "../db/app-client";
import { findAppUserByEmail, insertAppUser, type AppUserRow } from "../repositories/app-users";
import { insertSession, deleteSessionById, type SessionRow } from "../repositories/sessions";
import { hashPassword, verifyPassword } from "../security/password";
import { SESSION_TTL_MS } from "../session";
import { EmailAlreadyRegisteredError, InvalidCredentialsError } from "./errors";

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

function createSession(db: AppDb, appUserId: string): SessionRow {
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

export function registerAppUser(
  db: AppDb,
  input: RegisterInput,
): { appUser: AppUserRow; session: SessionRow } {
  if (findAppUserByEmail(db, input.email)) {
    throw new EmailAlreadyRegisteredError(input.email);
  }
  const now = new Date().toISOString();
  const appUser: AppUserRow = {
    id: crypto.randomUUID(),
    email: input.email,
    passwordHash: hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  };
  insertAppUser(db, appUser);
  return { appUser, session: createSession(db, appUser.id) };
}

export function loginAppUser(
  db: AppDb,
  input: LoginInput,
): { appUser: AppUserRow; session: SessionRow } {
  const appUser = findAppUserByEmail(db, input.email);
  if (!appUser || !verifyPassword(input.password, appUser.passwordHash)) {
    // Deliberately generic — doesn't reveal whether the email exists.
    throw new InvalidCredentialsError();
  }
  return { appUser, session: createSession(db, appUser.id) };
}

export function logoutAppUser(db: AppDb, sessionId: string): void {
  deleteSessionById(db, sessionId);
}
