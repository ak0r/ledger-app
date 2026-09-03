import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { backupSettings } from "../db/schema";

export type BackupSettingsRow = typeof backupSettings.$inferSelect;

const SINGLETON_ID = "singleton";

export function findBackupSettings(db: DbOrTx): BackupSettingsRow | undefined {
  return db.select().from(backupSettings).where(eq(backupSettings.id, SINGLETON_ID)).get();
}

export function insertBackupSettings(db: DbOrTx, row: BackupSettingsRow): void {
  db.insert(backupSettings).values(row).run();
}

export function setAutomaticBackupEnabled(db: DbOrTx, enabled: boolean, updatedAt: string): void {
  db
    .update(backupSettings)
    .set({ automaticBackupEnabled: enabled, updatedAt })
    .where(eq(backupSettings.id, SINGLETON_ID))
    .run();
}

export { SINGLETON_ID as BACKUP_SETTINGS_SINGLETON_ID };
