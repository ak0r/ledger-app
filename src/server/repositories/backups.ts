import { desc, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { backups } from "../persistence/schema";

export type BackupRow = typeof backups.$inferSelect;

export function insertBackup(db: DbOrTx, row: BackupRow): void {
  db.insert(backups).values(row).run();
}

// Newest first — the only order Backup History is ever shown in.
export function listBackups(db: DbOrTx): BackupRow[] {
  return db.select().from(backups).orderBy(desc(backups.createdAt)).all();
}

export function findLatestCompletedBackup(db: DbOrTx): BackupRow | undefined {
  return db
    .select()
    .from(backups)
    .where(eq(backups.status, "completed"))
    .orderBy(desc(backups.createdAt))
    .limit(1)
    .get();
}
