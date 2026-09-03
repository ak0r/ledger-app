import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { Db } from "../db/client";
import { DATA_DIR } from "../db/client";
import {
  findLatestCompletedBackup,
  insertBackup,
  listBackups,
  type BackupRow,
} from "../repositories/backups";
import {
  findBackupSettings,
  insertBackupSettings,
  setAutomaticBackupEnabled as setAutomaticBackupEnabledRow,
  BACKUP_SETTINGS_SINGLETON_ID,
  type BackupSettingsRow,
} from "../repositories/backupSettings";

// Whole-instance backup, server-side, no browser filesystem dependency
// (2026-09-03 Settings/Backup/Data Management delta §9-10) — the backup
// unit is the single `ledger.db` file itself (rule: "1 Hosted Instance ->
// 1 database"), so `better-sqlite3`'s native `.backup()` already captures
// every table (Users, Profiles, Accounts, Transactions, Budgets,
// Dashboards, Currencies, Backup History itself, everything). Location is
// a fixed server-filesystem path for now (`<data>/backups`), not a
// user-editable field — an arbitrary writable path is a real trust-
// boundary concern this phase doesn't need to take on; the delta only
// requires the UI to make clear this is the *server's* filesystem, not
// the browser user's.
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
const AUTOMATIC_BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24;

export function listBackupHistory(db: Db): BackupRow[] {
  return listBackups(db);
}

// Lazily creates the singleton settings row on first read, defaulting
// Automatic Backup to on — same "find-or-create" posture as
// getDefaultDashboardWithPanels for a pre-existing Profile with no
// Dashboard yet.
export function getBackupSettings(db: Db): BackupSettingsRow {
  const existing = findBackupSettings(db);
  if (existing) return existing;

  const now = new Date().toISOString();
  const row: BackupSettingsRow = {
    id: BACKUP_SETTINGS_SINGLETON_ID,
    automaticBackupEnabled: true,
    updatedAt: now,
  };
  insertBackupSettings(db, row);
  return row;
}

export function setAutomaticBackupEnabled(db: Db, enabled: boolean): BackupSettingsRow {
  getBackupSettings(db); // ensures the singleton row exists before updating it
  const updatedAt = new Date().toISOString();
  setAutomaticBackupEnabledRow(db, enabled, updatedAt);
  return { id: BACKUP_SETTINGS_SINGLETON_ID, automaticBackupEnabled: enabled, updatedAt };
}

// `source` is the raw better-sqlite3 handle to back up — injected rather
// than importing db/client.ts's singleton directly, so this is safely
// testable against a throwaway source database instead of ever touching
// the real `data/ledger.db` file from a test run. Production callers
// (actions/backups.ts, the (app) layout) pass db/client.ts's own exported
// `sqlite`. `db` (the Drizzle wrapper) is separate — it's only used to
// record the resulting `backups` history row. `backupDir` defaults to the
// real `BACKUP_DIR` and is only ever overridden by tests, for the same
// reason `source` is injected — a test run must never write into the real
// `data/backups` directory.
//
// "Backup Now" (§10.1) and the automatic-backup path below both call this.
// Failure is recorded as history, not thrown past this point — a failed
// backup must never surface as a page-level error to whatever unrelated
// request triggered the automatic check.
export async function runBackup(
  db: Db,
  source: Database.Database,
  backupDir: string = BACKUP_DIR,
): Promise<BackupRow> {
  if (!existsSync(/* turbopackIgnore: true */ backupDir)) {
    mkdirSync(/* turbopackIgnore: true */ backupDir, { recursive: true });
  }

  const now = new Date();
  const fileName = `ledger-${now.toISOString().replace(/[:.]/g, "-")}.db`;
  const filePath = path.join(backupDir, fileName);

  let row: BackupRow;
  try {
    await source.backup(filePath);
    const { size } = statSync(filePath);
    row = {
      id: crypto.randomUUID(),
      filePath,
      sizeBytes: size,
      status: "completed",
      errorMessage: null,
      createdAt: now.toISOString(),
    };
  } catch (error) {
    row = {
      id: crypto.randomUUID(),
      filePath,
      sizeBytes: null,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      createdAt: now.toISOString(),
    };
  }

  insertBackup(db, row);
  return row;
}

// Best-effort "every 24 hours" (§10.2) — checked opportunistically on
// request rather than a real background timer/cron. This codebase
// deliberately avoids process-lifecycle side effects at module-import time
// (db/client.ts's own comment: an eager top-level migrate() call raced
// `next build`'s parallel workers) — a `setInterval` started at module
// scope would risk the same class of problem (multiple Next.js workers,
// dev-mode module reloads, each spawning its own timer). Calling this from
// a request handler (the (app) layout) has none of that risk: it only
// runs inside a real request, same as every other DB read already there.
export async function runBackupIfDue(
  db: Db,
  source: Database.Database,
  backupDir: string = BACKUP_DIR,
): Promise<void> {
  const settings = getBackupSettings(db);
  if (!settings.automaticBackupEnabled) return;

  const latest = findLatestCompletedBackup(db);
  const isDue = !latest || Date.now() - new Date(latest.createdAt).getTime() >= AUTOMATIC_BACKUP_INTERVAL_MS;
  if (isDue) {
    await runBackup(db, source, backupDir);
  }
}
