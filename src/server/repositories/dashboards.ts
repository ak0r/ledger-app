import { and, eq } from "drizzle-orm";
import type { DashboardContext } from "@/core";
import type { DbOrTx } from "../persistence/client";
import { dashboards } from "../persistence/schema";

export type DashboardRow = typeof dashboards.$inferSelect;

export function insertDashboard(db: DbOrTx, row: DashboardRow): void {
  db.insert(dashboards).values(row).run();
}

// Profile-scoped (rule #6).
export function findDashboardById(db: DbOrTx, id: string, profileId: string): DashboardRow | undefined {
  return db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.profileId, profileId)))
    .get();
}

// One Dashboard per (Profile, context) since the Dashboard System Phase 1
// delta (2026-09-06) — `isDefault` alone is no longer a unique-enough
// filter (every context's row has it `true`), so this always filters by
// `context` explicitly.
export function findDashboardByProfileAndContext(
  db: DbOrTx,
  profileId: string,
  context: DashboardContext,
): DashboardRow | undefined {
  return db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.profileId, profileId), eq(dashboards.context, context)))
    .get();
}
