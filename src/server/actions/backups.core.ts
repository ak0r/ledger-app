import type { Db } from "../persistence/client";
import type { BackupSettingsRow } from "../repositories/backupSettings";
import { setAutomaticBackupEnabled } from "../services/backups";
import { setAutomaticBackupEnabledSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function setAutomaticBackupEnabledCore(db: Db, input: unknown): ActionResult<BackupSettingsRow> {
  const parsed = setAutomaticBackupEnabledSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(setAutomaticBackupEnabled(db, parsed.data.enabled));
  } catch (error) {
    return fromThrown(error);
  }
}
