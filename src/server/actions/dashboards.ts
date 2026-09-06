"use server";

import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { DashboardPanelRow } from "../repositories/dashboardPanels";
import { addPanelCore, movePanelCore, removePanelCore, updatePanelConfigurationCore } from "./dashboards.core";
import type { ActionResult } from "./result";

export async function addPanelAction(input: unknown): Promise<ActionResult<DashboardPanelRow>> {
  const { profile } = await requireActiveProfile();
  return addPanelCore(db, { ...(input as object), profileId: profile.id });
}

export async function removePanelAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  return removePanelCore(db, { ...(input as object), profileId: profile.id });
}

export async function movePanelAction(input: unknown): Promise<ActionResult<DashboardPanelRow>> {
  const { profile } = await requireActiveProfile();
  return movePanelCore(db, { ...(input as object), profileId: profile.id });
}

export async function updatePanelConfigurationAction(input: unknown): Promise<ActionResult<DashboardPanelRow>> {
  const { profile } = await requireActiveProfile();
  return updatePanelConfigurationCore(db, { ...(input as object), profileId: profile.id });
}
