import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDbWithRaw } from "../testing/createTestDb";
import { insertAppUser } from "../repositories/app-users";
import { insertSession } from "../repositories/sessions";
import { findCurrenciesByProfile } from "../repositories/currencies";
import { findAccountsByProfile } from "../repositories/accounts";
import { insertAccountIdentifier } from "../repositories/accountIdentifiers";
import { insertImportFile } from "../repositories/importFiles";
import { insertInstrument } from "../repositories/instruments";
import { createProfile } from "./profiles";
import { createDemoProfileData } from "./demo-data";
import { getBackupSettings, runBackup } from "./backups";
import { listTransactions } from "./transactions";
import { resetLedger } from "./reset";
import {
  accountIdentifiers,
  accounts,
  appUsers,
  backupSettings,
  backups,
  budgetAllocations,
  budgetPeriods,
  budgets,
  currencies,
  dashboardPanels,
  dashboards,
  importFiles,
  instruments,
  postings,
  profiles,
  recurringRules,
  sessions,
  transactions,
} from "../db/schema";

const ALL_TABLES = {
  accountIdentifiers,
  accounts,
  appUsers,
  backupSettings,
  backups,
  budgetAllocations,
  budgetPeriods,
  budgets,
  currencies,
  dashboardPanels,
  dashboards,
  importFiles,
  instruments,
  postings,
  profiles,
  recurringRules,
  sessions,
  transactions,
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "ledger-reset-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("resetLedger", () => {
  it("empties every table in the instance, across Profiles, Users and Backups alike", async () => {
    const { db, sqlite } = createTestDbWithRaw();

    // Seed a realistic, populated instance: two Profiles (one with a full
    // demo dataset — Accounts, Transactions, Postings, Recurring Rules,
    // Budgets, Budget Periods/Allocations, a Starter Dashboard + Panels,
    // Currencies), an AppUser + Session, and Backup history/settings.
    const profile = createProfile(db, { name: "Amit" });
    createProfile(db, { name: "Partner" });
    createDemoProfileData(db, profile.id);
    expect(listTransactions(db, profile.id).length).toBeGreaterThan(0);
    expect(findCurrenciesByProfile(db, profile.id).length).toBeGreaterThan(0);

    const appUserId = crypto.randomUUID();
    insertAppUser(db, {
      id: appUserId,
      email: "amit@example.com",
      passwordHash: "not-a-real-hash",
      isPrimary: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    insertSession(db, {
      id: crypto.randomUUID(),
      appUserId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    // The demo dataset doesn't touch these three (Import Framework/
    // Instrument Model tables) — seed them directly so the pre-reset
    // sanity check below is meaningful for literally every table.
    const now = new Date().toISOString();
    const [account] = findAccountsByProfile(db, profile.id);
    insertAccountIdentifier(db, {
      id: crypto.randomUUID(),
      accountId: account!.id,
      identifier: "XXXX1234",
      createdAt: now,
      updatedAt: now,
    });
    insertImportFile(db, {
      id: crypto.randomUUID(),
      profileId: profile.id,
      filename: "statement.csv",
      source: "generic.csv",
      status: "successful",
      accountId: account!.id,
      newAccountCount: 0,
      inflowMinor: 0,
      outflowMinor: 0,
      dateRangeStart: null,
      dateRangeEnd: null,
      transactionCount: 0,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    });
    insertInstrument(db, {
      id: crypto.randomUUID(),
      type: "STOCK",
      name: "Test Corp",
      unitLabel: null,
      createdAt: now,
      updatedAt: now,
    });

    getBackupSettings(db);
    await runBackup(db, sqlite, tmpDir);

    // Sanity check: every table actually has at least one row before reset,
    // otherwise "empties every table" wouldn't be a meaningful assertion.
    for (const [name, table] of Object.entries(ALL_TABLES)) {
      expect(db.select().from(table as never).all().length, `${name} should be seeded`).toBeGreaterThan(0);
    }

    resetLedger(db, sqlite);

    for (const [name, table] of Object.entries(ALL_TABLES)) {
      expect(db.select().from(table as never).all(), `${name} should be empty after reset`).toEqual([]);
    }

    // foreign_keys enforcement must be restored, not left disabled.
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
