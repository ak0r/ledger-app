import { and, eq } from "drizzle-orm";
import type { AppDbOrTx } from "../db/app-client";
import { families } from "../db/app-schema";

export type FamilyRow = typeof families.$inferSelect;

export function insertFamily(db: AppDbOrTx, row: FamilyRow): void {
  db.insert(families).values(row).run();
}

// Every query is scoped by appUserId (mirrors rule #6's memberId
// discipline, one level up) — a family that exists but belongs to someone
// else is indistinguishable from a family that doesn't exist at all, which
// is exactly the point: never leak existence across AppUsers.
export function findFamilyById(db: AppDbOrTx, id: string, appUserId: string): FamilyRow | undefined {
  return db
    .select()
    .from(families)
    .where(and(eq(families.id, id), eq(families.appUserId, appUserId)))
    .get();
}

export function findAllFamilies(db: AppDbOrTx, appUserId: string): FamilyRow[] {
  return db.select().from(families).where(eq(families.appUserId, appUserId)).all();
}

export function updateFamilyName(
  db: AppDbOrTx,
  id: string,
  appUserId: string,
  name: string,
  updatedAt: string,
): void {
  db
    .update(families)
    .set({ name, updatedAt })
    .where(and(eq(families.id, id), eq(families.appUserId, appUserId)))
    .run();
}

export function deleteFamilyRow(db: AppDbOrTx, id: string, appUserId: string): void {
  db.delete(families).where(and(eq(families.id, id), eq(families.appUserId, appUserId))).run();
}
