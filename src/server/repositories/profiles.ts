import { eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { profiles } from "../persistence/schema";

export type ProfileRow = typeof profiles.$inferSelect;

export function insertProfile(db: DbOrTx, row: ProfileRow): void {
  db.insert(profiles).values(row).run();
}

export function findProfileById(db: DbOrTx, id: string): ProfileRow | undefined {
  return db.select().from(profiles).where(eq(profiles.id, id)).get();
}

export function findAllProfiles(db: DbOrTx): ProfileRow[] {
  return db.select().from(profiles).all();
}

export function findProfileByAppUserId(db: DbOrTx, appUserId: string): ProfileRow | undefined {
  return db.select().from(profiles).where(eq(profiles.appUserId, appUserId)).get();
}

// Used only by linkProfileToAppUser (use-case layer) — links an existing
// unregistered Profile to a newly-registered AppUser (2026-08-20 User
// Simplification delta §6, "Registration of an existing Profile").
export function setProfileAppUserId(
  db: DbOrTx,
  id: string,
  appUserId: string,
  updatedAt: string,
): void {
  db.update(profiles).set({ appUserId, updatedAt }).where(eq(profiles.id, id)).run();
}

export function setProfileName(db: DbOrTx, id: string, name: string, updatedAt: string): void {
  db.update(profiles).set({ name, updatedAt }).where(eq(profiles.id, id)).run();
}

export function setProfilePan(
  db: DbOrTx,
  id: string,
  panEncrypted: string,
  panHash: string,
  updatedAt: string,
): void {
  db.update(profiles).set({ panEncrypted, panHash, updatedAt }).where(eq(profiles.id, id)).run();
}

export function setProfilePrimaryCurrencyId(
  db: DbOrTx,
  id: string,
  primaryCurrencyId: string,
  updatedAt: string,
): void {
  db.update(profiles).set({ primaryCurrencyId, updatedAt }).where(eq(profiles.id, id)).run();
}

// Clean Up Content (cleanup.ts) must null this out before deleting a
// Profile's Currencies — `primaryCurrencyId` is a real FK to `currencies`,
// so deleting the row it still points at would otherwise violate it.
export function clearProfilePrimaryCurrencyId(db: DbOrTx, id: string, updatedAt: string): void {
  db.update(profiles).set({ primaryCurrencyId: null, updatedAt }).where(eq(profiles.id, id)).run();
}
