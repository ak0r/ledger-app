import type { Db, DbOrTx } from "../db/client";
import {
  findAllProfiles,
  findProfileByAppUserId,
  findProfileById,
  insertProfile,
  setProfileAppUserId,
  setProfileName,
  setProfilePrimaryCurrencyId,
  type ProfileRow,
} from "../repositories/profiles";
import { findCurrencyById } from "../repositories/currencies";
import { createStarterDashboard } from "./dashboards";
import { NotFoundError, ProfileAlreadyLinkedError } from "./errors";

export interface CreateProfileInput {
  name: string;
}

// A new Profile always gets its Starter Dashboard in the same transaction
// (spec §5) — this is the Primary User's "create a Profile for someone
// else" path; the other Profile-creation path (registerAppUser,
// use-cases/auth.ts) does the same inside its own transaction. `db: Db`
// rather than `DbOrTx` — needs its own transaction() call, so it can't
// itself be called from inside a caller's already-open one.
export function createProfile(db: Db, input: CreateProfileInput): ProfileRow {
  const now = new Date().toISOString();
  const profile: ProfileRow = {
    id: crypto.randomUUID(),
    name: input.name,
    appUserId: null,
    primaryCurrencyId: null,
    createdAt: now,
    updatedAt: now,
  };
  db.transaction((tx) => {
    insertProfile(tx, profile);
    createStarterDashboard(tx, profile.id);
  });
  return profile;
}

export function listProfiles(db: Db): ProfileRow[] {
  return findAllProfiles(db);
}

export function getProfile(db: Db, profileId: string): ProfileRow | undefined {
  return findProfileById(db, profileId);
}

export function getProfileByAppUserId(db: Db, appUserId: string): ProfileRow | undefined {
  return findProfileByAppUserId(db, appUserId);
}

// Links an existing unregistered Profile to a newly-registered AppUser
// (2026-08-20 User Simplification delta §6) — rejects if the target is
// already linked, so a registration link can never steal or duplicate
// someone else's Profile ("cannot be linked to more than one AppUser",
// "does not create a duplicate Profile").
export function linkProfileToAppUser(db: DbOrTx, profileId: string, appUserId: string): ProfileRow {
  const profile = findProfileById(db, profileId);
  if (!profile) throw new NotFoundError(`Profile not found: ${profileId}`);
  if (profile.appUserId) throw new ProfileAlreadyLinkedError(profileId);

  const updatedAt = new Date().toISOString();
  setProfileAppUserId(db, profileId, appUserId, updatedAt);
  return { ...profile, appUserId, updatedAt };
}

// Rename only — Profile deletion has no use-case yet (no server-side
// support exists for tearing down a Profile and its data), so no action
// exposes it. Follows the same read-then-write shape as
// linkProfileToAppUser.
export function renameProfile(db: DbOrTx, profileId: string, name: string): ProfileRow {
  const profile = findProfileById(db, profileId);
  if (!profile) throw new NotFoundError(`Profile not found: ${profileId}`);

  const updatedAt = new Date().toISOString();
  setProfileName(db, profileId, name, updatedAt);
  return { ...profile, name, updatedAt };
}

// Default for newly created Accounts (Currency Catalogue delta,
// 2026-09-03) — changeable, never retroactive: existing Accounts keep
// whatever currency they already have. `currencyId` must belong to this
// same Profile (findCurrencyById is itself Profile-scoped, rule #6) — a
// Profile can only be primary'd on a currency it has actually instantiated.
export function setProfilePrimaryCurrency(db: DbOrTx, profileId: string, currencyId: string): ProfileRow {
  const profile = findProfileById(db, profileId);
  if (!profile) throw new NotFoundError(`Profile not found: ${profileId}`);
  const currency = findCurrencyById(db, currencyId, profileId);
  if (!currency) throw new NotFoundError(`Currency ${currencyId} not found for profile ${profileId}`);

  const updatedAt = new Date().toISOString();
  setProfilePrimaryCurrencyId(db, profileId, currencyId, updatedAt);
  return { ...profile, primaryCurrencyId: currencyId, updatedAt };
}
