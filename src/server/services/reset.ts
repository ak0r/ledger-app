import type Database from "better-sqlite3";
import type { Db } from "../persistence/client";
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
} from "../persistence/schema";

// Reset Ledger (2026-09-03 Settings/Backup/Data Management delta §17) —
// the Ledger Instance boundary, not a Profile: every table, every Profile,
// unconditionally. Deliberately different from Clean Up Content
// (use-cases/cleanup.ts), which only ever clears one Profile's data and
// always keeps that Profile's row itself.
//
// `sqliteHandle` is injected the same way runBackup's `source` is
// (use-cases/backups.ts) — so this is safely testable against a throwaway
// database rather than ever touching the real one from a test run.
//
// Deletes every table unconditionally rather than hand-ordering ~18 tables
// around their FK graph (which includes a real cycle:
// profiles.primaryCurrencyId <-> currencies.profileId, the same one
// cleanup.ts has to null out first) — `foreign_keys` is toggled off for
// the duration since every table ends up empty regardless of order.
// SQLite only applies a `PRAGMA foreign_keys` change between transactions,
// so it must run outside the transaction below.
export function resetLedger(db: Db, sqliteHandle: Database.Database): void {
  sqliteHandle.pragma("foreign_keys = OFF");
  try {
    db.transaction((tx) => {
      tx.delete(dashboardPanels).run();
      tx.delete(dashboards).run();
      tx.delete(postings).run();
      tx.delete(transactions).run();
      tx.delete(budgetAllocations).run();
      tx.delete(budgetPeriods).run();
      tx.delete(budgets).run();
      tx.delete(recurringRules).run();
      tx.delete(accountIdentifiers).run();
      tx.delete(importFiles).run();
      tx.delete(accounts).run();
      tx.delete(currencies).run();
      tx.delete(instruments).run();
      tx.delete(profiles).run();
      tx.delete(sessions).run();
      tx.delete(appUsers).run();
      tx.delete(backups).run();
      tx.delete(backupSettings).run();
    });
  } finally {
    sqliteHandle.pragma("foreign_keys = ON");
  }
}
