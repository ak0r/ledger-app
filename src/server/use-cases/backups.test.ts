import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { findBackupSettings } from "../repositories/backupSettings";
import {
  getBackupSettings,
  listBackupHistory,
  runBackup,
  runBackupIfDue,
  setAutomaticBackupEnabled,
} from "./backups";

// A throwaway real (non-`:memory:`) better-sqlite3 handle stands in for
// db/client.ts's production `sqlite` export — `.backup()` needs a real
// handle, but this must never be the actual singleton or it would touch
// `data/ledger.db` from a test run. `tmpDir` stands in for the real
// `BACKUP_DIR` for the same reason: tests must never write into the
// instance's actual `data/backups` folder.
let tmpDir: string;
let source: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "ledger-backup-test-"));
  source = new Database(":memory:");
});

afterEach(() => {
  source.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("runBackup", () => {
  it("writes a backup file and records a completed history row with its size", async () => {
    const db = createTestDb();

    const row = await runBackup(db, source, tmpDir);

    expect(row.status).toBe("completed");
    expect(row.sizeBytes).toBeGreaterThan(0);
    expect(readdirSync(tmpDir)).toHaveLength(1);
    expect(listBackupHistory(db)).toHaveLength(1);
    expect(listBackupHistory(db)[0]!.id).toBe(row.id);
  });

  it("records a failed history row instead of throwing when the backup itself fails", async () => {
    const db = createTestDb();
    source.close(); // a closed handle makes .backup() reject

    const row = await runBackup(db, source, tmpDir);

    expect(row.status).toBe("failed");
    expect(row.sizeBytes).toBeNull();
    expect(row.errorMessage).toBeTruthy();
    expect(listBackupHistory(db)).toHaveLength(1);
  });
});

describe("getBackupSettings", () => {
  it("lazily creates the singleton row, defaulting Automatic Backup to on", () => {
    const db = createTestDb();
    expect(findBackupSettings(db)).toBeUndefined();

    const settings = getBackupSettings(db);

    expect(settings.automaticBackupEnabled).toBe(true);
    expect(findBackupSettings(db)).toBeDefined();
  });

  it("returns the same row on repeated calls, not a second one", () => {
    const db = createTestDb();
    const first = getBackupSettings(db);
    const second = getBackupSettings(db);
    expect(second.id).toBe(first.id);
  });
});

describe("setAutomaticBackupEnabled", () => {
  it("persists the new value", () => {
    const db = createTestDb();
    getBackupSettings(db);

    setAutomaticBackupEnabled(db, false);

    expect(getBackupSettings(db).automaticBackupEnabled).toBe(false);
  });
});

describe("runBackupIfDue", () => {
  it("runs a backup when none exists yet", async () => {
    const db = createTestDb();

    await runBackupIfDue(db, source, tmpDir);

    expect(listBackupHistory(db)).toHaveLength(1);
  });

  it("does not run a backup when the latest one is recent", async () => {
    const db = createTestDb();
    await runBackup(db, source, tmpDir);

    await runBackupIfDue(db, source, tmpDir);

    expect(listBackupHistory(db)).toHaveLength(1);
  });

  it("does not run when Automatic Backup is disabled", async () => {
    const db = createTestDb();
    setAutomaticBackupEnabled(db, false);

    await runBackupIfDue(db, source, tmpDir);

    expect(listBackupHistory(db)).toHaveLength(0);
  });
});
