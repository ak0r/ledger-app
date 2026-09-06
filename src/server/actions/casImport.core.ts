import type { Db } from "../persistence/client";
import { previewCasImport, runCasImport, type CasImportPreview, type CasImportResult } from "../services/casImport";
import { previewCasImportSchema, runCasImportSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export async function previewCasImportCore(
  db: Db,
  input: unknown,
  pdfBytes: Buffer,
): Promise<ActionResult<CasImportPreview>> {
  const parsed = previewCasImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await previewCasImport(db, { ...parsed.data, pdfBytes }));
  } catch (error) {
    return fromThrown(error);
  }
}

export async function runCasImportCore(
  db: Db,
  input: unknown,
  pdfBytes: Buffer,
): Promise<ActionResult<CasImportResult>> {
  const parsed = runCasImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await runCasImport(db, { ...parsed.data, pdfBytes }));
  } catch (error) {
    return fromThrown(error);
  }
}
