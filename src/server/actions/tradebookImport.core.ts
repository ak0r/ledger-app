import type { Db } from "../persistence/client";
import {
  previewTradebookImport,
  runTradebookImport,
  type TradebookImportPreview,
  type TradebookImportResult,
} from "../services/tradebookImport";
import { previewTradebookImportSchema, runTradebookImportSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export async function previewTradebookImportCore(
  db: Db,
  input: unknown,
  fileBytes: Buffer,
  filename: string,
): Promise<ActionResult<TradebookImportPreview>> {
  const parsed = previewTradebookImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await previewTradebookImport(db, { ...parsed.data, fileBytes, filename }));
  } catch (error) {
    return fromThrown(error);
  }
}

export async function runTradebookImportCore(
  db: Db,
  input: unknown,
  fileBytes: Buffer,
  filename: string,
): Promise<ActionResult<TradebookImportResult>> {
  const parsed = runTradebookImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await runTradebookImport(db, { ...parsed.data, fileBytes, filename }));
  } catch (error) {
    return fromThrown(error);
  }
}
