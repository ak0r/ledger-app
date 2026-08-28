import type { Db } from "../db/client";
import { commitImport, previewImport, type ImportPreview } from "../use-cases/imports";
import type { ImportFileRow } from "../repositories/importFiles";
import { commitImportSchema, previewImportSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export async function previewImportCore(db: Db, input: unknown): Promise<ActionResult<ImportPreview>> {
  const parsed = previewImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await previewImport(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function commitImportCore(db: Db, input: unknown): ActionResult<ImportFileRow[]> {
  const parsed = commitImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(commitImport(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}
