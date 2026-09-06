import type Database from "better-sqlite3";
import type { Db } from "../persistence/client";
import { resetLedger } from "../services/reset";
import { resetLedgerSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function resetLedgerCore(db: Db, sqliteHandle: Database.Database, input: unknown): ActionResult<void> {
  const parsed = resetLedgerSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    resetLedger(db, sqliteHandle);
    return ok(undefined);
  } catch (error) {
    return fromThrown(error);
  }
}
