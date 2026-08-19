import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/family-client";
import { members } from "../db/schema";

export type MemberRow = typeof members.$inferSelect;

export function insertMember(db: DbOrTx, row: MemberRow): void {
  db.insert(members).values(row).run();
}

export function findMemberById(db: DbOrTx, id: string): MemberRow | undefined {
  return db.select().from(members).where(eq(members.id, id)).get();
}

export function findAllMembers(db: DbOrTx): MemberRow[] {
  return db.select().from(members).all();
}

// Both used only by setPrimaryMember (use-case layer), which wraps them in
// one db.transaction() so "clear the old primary, set the new one" is
// atomic — never a moment with zero or two primaries visible to a reader.
export function clearAllPrimaryMembers(db: DbOrTx, updatedAt: string): void {
  db.update(members).set({ isPrimary: false, updatedAt }).where(eq(members.isPrimary, true)).run();
}

export function setMemberPrimary(db: DbOrTx, id: string, updatedAt: string): void {
  db.update(members).set({ isPrimary: true, updatedAt }).where(eq(members.id, id)).run();
}
