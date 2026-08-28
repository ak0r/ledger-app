import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { importFiles } from "../db/schema";

export type ImportFileRow = typeof importFiles.$inferSelect;

export function insertImportFile(db: DbOrTx, row: ImportFileRow): void {
  db.insert(importFiles).values(row).run();
}

// Profile-scoped (rule #6). Newest first — matches the Import History
// ordering implied by the original Phase 1 delta §11's example (most
// recent import on top).
export function findImportFilesByProfile(db: DbOrTx, profileId: string): ImportFileRow[] {
  return db
    .select()
    .from(importFiles)
    .where(eq(importFiles.profileId, profileId))
    .orderBy(desc(importFiles.createdAt))
    .all();
}

export function findImportFileById(db: DbOrTx, id: string, profileId: string): ImportFileRow | undefined {
  return db
    .select()
    .from(importFiles)
    .where(and(eq(importFiles.id, id), eq(importFiles.profileId, profileId)))
    .get();
}
