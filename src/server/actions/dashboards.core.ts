import type { Db } from "../persistence/client";
import type { DashboardPanelRow } from "../repositories/dashboardPanels";
import { addPanel, movePanel, removePanel, updatePanelConfiguration } from "../services/dashboards";
import { addPanelSchema, movePanelSchema, removePanelSchema, updatePanelConfigurationSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function addPanelCore(db: Db, input: unknown): ActionResult<DashboardPanelRow> {
  const parsed = addPanelSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(addPanel(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function removePanelCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = removePanelSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    removePanel(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}

export function movePanelCore(db: Db, input: unknown): ActionResult<DashboardPanelRow> {
  const parsed = movePanelSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(movePanel(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function updatePanelConfigurationCore(db: Db, input: unknown): ActionResult<DashboardPanelRow> {
  const parsed = updatePanelConfigurationSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(
      updatePanelConfiguration(db, {
        panelId: parsed.data.panelId,
        profileId: parsed.data.profileId,
        configuration: parsed.data.configuration,
      }),
    );
  } catch (error) {
    return fromThrown(error);
  }
}
