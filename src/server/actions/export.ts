"use server";

import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import { exportTransactionsCsv } from "../services/export";
import type { ActionResult } from "./result";

// Export Data (§16) — scoped to the active Profile, not instance-level like
// Backup. Returns the CSV as a string rather than a file response: this
// codebase's established data-fetching mechanism is Server Actions
// everywhere (no Route Handler exists anywhere else in the app), so the
// client component triggers the actual browser download itself (Blob +
// object URL) rather than introducing a new architectural pattern for one
// feature.
export async function exportTransactionsCsvAction(): Promise<ActionResult<string>> {
  const { profile } = await requireActiveProfile();
  return { success: true, data: exportTransactionsCsv(db, profile.id) };
}
