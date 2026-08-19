import { eq } from "drizzle-orm";
import type { RegistryDbOrTx } from "../db/registry-client";
import { families } from "../db/registry-schema";

export type FamilyRow = typeof families.$inferSelect;

export function insertFamily(db: RegistryDbOrTx, row: FamilyRow): void {
  db.insert(families).values(row).run();
}

export function findFamilyById(db: RegistryDbOrTx, id: string): FamilyRow | undefined {
  return db.select().from(families).where(eq(families.id, id)).get();
}

export function findAllFamilies(db: RegistryDbOrTx): FamilyRow[] {
  return db.select().from(families).all();
}

export function updateFamilyName(db: RegistryDbOrTx, id: string, name: string, updatedAt: string): void {
  db.update(families).set({ name, updatedAt }).where(eq(families.id, id)).run();
}

export function deleteFamilyRow(db: RegistryDbOrTx, id: string): void {
  db.delete(families).where(eq(families.id, id)).run();
}
