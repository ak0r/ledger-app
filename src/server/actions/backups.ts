"use server";

import { revalidatePath } from "next/cache";
import { db, sqlite } from "../db/client";
import { requirePrimaryUser } from "../authz";
import type { BackupSettingsRow } from "../repositories/backupSettings";
import { runBackup } from "../use-cases/backups";
import { setAutomaticBackupEnabledCore } from "./backups.core";
import type { ActionResult } from "./result";

// Backup affects the whole Ledger Instance (every Profile's data, rule #6
// exemption) — gated the same way Manage Profiles is, Primary User only.
export async function createBackupAction(): Promise<void> {
  await requirePrimaryUser();
  await runBackup(db, sqlite);
  revalidatePath("/settings/backups");
}

export async function setAutomaticBackupEnabledAction(
  input: unknown,
): Promise<ActionResult<BackupSettingsRow>> {
  await requirePrimaryUser();
  const result = setAutomaticBackupEnabledCore(db, input);
  if (result.success) {
    revalidatePath("/settings/backups");
  }
  return result;
}
