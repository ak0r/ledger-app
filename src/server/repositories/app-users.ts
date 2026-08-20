import { eq } from "drizzle-orm";
import type { AppDbOrTx } from "../db/app-client";
import { appUsers } from "../db/app-schema";

export type AppUserRow = typeof appUsers.$inferSelect;

export function insertAppUser(db: AppDbOrTx, row: AppUserRow): void {
  db.insert(appUsers).values(row).run();
}

export function findAppUserByEmail(db: AppDbOrTx, email: string): AppUserRow | undefined {
  return db.select().from(appUsers).where(eq(appUsers.email, email)).get();
}

export function findAppUserById(db: AppDbOrTx, id: string): AppUserRow | undefined {
  return db.select().from(appUsers).where(eq(appUsers.id, id)).get();
}
