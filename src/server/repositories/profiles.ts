import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { profiles } from "../db/schema";

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
