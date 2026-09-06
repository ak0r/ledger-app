import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { navHistory } from "../persistence/schema";

export type NavHistoryRow = typeof navHistory.$inferSelect;

// Not Profile-scoped — a NAV is a market fact, same posture as
// `instruments` itself (schema.ts's own comment on `nav_history`).
export function insertNavHistory(db: DbOrTx, row: NavHistoryRow): void {
  db.insert(navHistory).values(row).run();
}

export function findLatestNav(db: DbOrTx, instrumentId: string): NavHistoryRow | undefined {
  return db
    .select()
    .from(navHistory)
    .where(eq(navHistory.instrumentId, instrumentId))
    .orderBy(desc(navHistory.date))
    .limit(1)
    .get();
}

export function findNavHistoryByInstrument(db: DbOrTx, instrumentId: string): NavHistoryRow[] {
  return db
    .select()
    .from(navHistory)
    .where(eq(navHistory.instrumentId, instrumentId))
    .orderBy(desc(navHistory.date))
    .all();
}

export function findNavByInstrumentAndDate(
  db: DbOrTx,
  instrumentId: string,
  date: string,
): NavHistoryRow | undefined {
  return db
    .select()
    .from(navHistory)
    .where(and(eq(navHistory.instrumentId, instrumentId), eq(navHistory.date, date)))
    .get();
}

// Used by recordNav's upsert (services/navHistory.ts) once a real feed
// (services/navRefresh.ts) can re-report the same (instrument, date) on
// every run — app-layer check-then-write, same posture as `instruments`'
// (source, sourceId) identity (schema.ts's own comment on that table), not
// a DB unique index.
export function updateNavHistory(db: DbOrTx, id: string, nav: number, source: string | null, updatedAt: string): void {
  db.update(navHistory).set({ nav, source, updatedAt }).where(eq(navHistory.id, id)).run();
}

// The instance-wide "when did NAV last refresh" signal (services/
// navRefresh.ts's due-check) — no instrument filter, most recently
// touched row across the whole (not Profile-scoped) table. Same "state
// lives in the history table itself, no separate settings row" posture
// services/backups.ts's `runBackupIfDue` already uses.
export function findMostRecentlyUpdatedNav(db: DbOrTx): NavHistoryRow | undefined {
  return db.select().from(navHistory).orderBy(desc(navHistory.updatedAt)).limit(1).get();
}
