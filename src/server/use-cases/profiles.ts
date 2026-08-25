import type { Db, DbOrTx } from "../db/client";
import {
  findAllProfiles,
  findProfileByAppUserId,
  findProfileById,
  insertProfile,
  setProfileAppUserId,
  setProfileName,
  type ProfileRow,
} from "../repositories/profiles";
import { NotFoundError, ProfileAlreadyLinkedError } from "./errors";

export interface CreateProfileInput {
  name: string;
}

export function createProfile(db: DbOrTx, input: CreateProfileInput): ProfileRow {
  const now = new Date().toISOString();
  const profile: ProfileRow = {
    id: crypto.randomUUID(),
    name: input.name,
    appUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  insertProfile(db, profile);
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
