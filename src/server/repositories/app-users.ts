import { eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { appUsers } from "../persistence/schema";

export type AppUserRow = typeof appUsers.$inferSelect;

export function insertAppUser(db: DbOrTx, row: AppUserRow): void {
  db.insert(appUsers).values(row).run();
}

export function findAppUserByEmail(db: DbOrTx, email: string): AppUserRow | undefined {
  return db.select().from(appUsers).where(eq(appUsers.email, email)).get();
}

export function findAppUserById(db: DbOrTx, id: string): AppUserRow | undefined {
  return db.select().from(appUsers).where(eq(appUsers.id, id)).get();
}

// Used by registerAppUser to decide whether the new AppUser is the Primary
// User (the very first one ever registered in this Hosted Instance).
export function hasAnyAppUser(db: DbOrTx): boolean {
  return db.select({ id: appUsers.id }).from(appUsers).limit(1).get() !== undefined;
}

export function updateAppUserPasswordHash(
  db: DbOrTx,
  id: string,
  passwordHash: string,
  updatedAt: string,
): void {
  db.update(appUsers).set({ passwordHash, updatedAt }).where(eq(appUsers.id, id)).run();
}
