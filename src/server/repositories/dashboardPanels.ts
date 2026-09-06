import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../persistence/client";
import { dashboardPanels, dashboards } from "../persistence/schema";

export type DashboardPanelRow = typeof dashboardPanels.$inferSelect;

export function insertDashboardPanel(db: DbOrTx, row: DashboardPanelRow): void {
  db.insert(dashboardPanels).values(row).run();
}

export function insertDashboardPanels(db: DbOrTx, rows: readonly DashboardPanelRow[]): void {
  if (rows.length === 0) return;
  db.insert(dashboardPanels).values([...rows]).run();
}

// Unscoped by profileId — same posture as findPostingsByTransaction: the
// caller already resolved/validated the parent Dashboard first.
export function findPanelsByDashboard(db: DbOrTx, dashboardId: string): DashboardPanelRow[] {
  return db.select().from(dashboardPanels).where(eq(dashboardPanels.dashboardId, dashboardId)).all();
}

// Profile-scoped via the `dashboards` join (rule #6) — `dashboard_panels`
// itself carries no `profile_id` column, same convention as
// `budget_periods`/`account_identifiers`.
export function findPanelById(db: DbOrTx, id: string, profileId: string): DashboardPanelRow | undefined {
  return db
    .select({
      id: dashboardPanels.id,
      dashboardId: dashboardPanels.dashboardId,
      key: dashboardPanels.key,
      configuration: dashboardPanels.configuration,
      x: dashboardPanels.x,
      y: dashboardPanels.y,
      createdAt: dashboardPanels.createdAt,
      updatedAt: dashboardPanels.updatedAt,
    })
    .from(dashboardPanels)
    .innerJoin(dashboards, eq(dashboardPanels.dashboardId, dashboards.id))
    .where(and(eq(dashboardPanels.id, id), eq(dashboards.profileId, profileId)))
    .get();
}

export function updatePanelConfiguration(
  db: DbOrTx,
  id: string,
  fields: Pick<DashboardPanelRow, "configuration" | "updatedAt">,
): void {
  db.update(dashboardPanels).set(fields).where(eq(dashboardPanels.id, id)).run();
}

export function updatePanelPlacement(db: DbOrTx, id: string, fields: Pick<DashboardPanelRow, "x" | "y" | "updatedAt">): void {
  db.update(dashboardPanels).set(fields).where(eq(dashboardPanels.id, id)).run();
}

// Immediate, no confirmation (spec §18).
export function deletePanelRow(db: DbOrTx, id: string): void {
  db.delete(dashboardPanels).where(eq(dashboardPanels.id, id)).run();
}
