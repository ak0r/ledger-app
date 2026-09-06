import type { Db } from "../persistence/client";
import type { FolioRow } from "../repositories/folios";
import { createFolio } from "../services/folios";
import { createFolioSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createFolioCore(db: Db, input: unknown): ActionResult<FolioRow> {
  const parsed = createFolioSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createFolio(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}
