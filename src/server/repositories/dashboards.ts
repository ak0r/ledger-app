import { and, eq } from "drizzle-orm";
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

// Phase 1 always has exactly one Dashboard per Profile and it's always the
// default (spec §4) — this is still the "find the default one" query
// rather than "find the only one," so a future multi-Dashboard Profile
// doesn't need this call site to change.
export function findDefaultDashboardByProfile(db: DbOrTx, profileId: string): DashboardRow | undefined {
  return db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.profileId, profileId), eq(dashboards.isDefault, true)))
    .get();
}
