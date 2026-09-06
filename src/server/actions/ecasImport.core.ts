import type { Db } from "../persistence/client";
import {
  previewEcasImport,
  runEcasImport,
  type EcasImportPreview,
  type EcasImportResult,
} from "../services/ecasImport";
import { previewEcasImportSchema, runEcasImportSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export async function previewEcasImportCore(
  db: Db,
  input: unknown,
  pdfBytes: Buffer,
): Promise<ActionResult<EcasImportPreview>> {
  const parsed = previewEcasImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await previewEcasImport(db, { ...parsed.data, pdfBytes }));
  } catch (error) {
    return fromThrown(error);
  }
}

export async function runEcasImportCore(
  db: Db,
  input: unknown,
  pdfBytes: Buffer,
): Promise<ActionResult<EcasImportResult>> {
  const parsed = runEcasImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await runEcasImport(db, { ...parsed.data, pdfBytes }));
  } catch (error) {
    return fromThrown(error);
  }
}
