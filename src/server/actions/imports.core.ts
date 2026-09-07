import type { Db } from "../persistence/client";
import type { ColumnMapping, RawTable } from "@/core";
import {
  commitImport,
  previewImport,
  previewCustomXlsImport,
  previewCustomPdfImport,
  readRawXlsTable,
  getPdfPageCount,
  extractPdfCropPreview,
  suggestMappingFor,
  type ImportPreview,
} from "../services/imports";
import type { ImportFileRow } from "../repositories/importFiles";
import {
  commitImportSchema,
  previewImportSchema,
  previewCustomXlsImportSchema,
  previewCustomPdfImportSchema,
  readRawXlsTableSchema,
  getPdfPageCountSchema,
  extractPdfCropPreviewSchema,
} from "./schemas";
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

// Ledger Custom Importer delta. `previewCustomXlsImportCore`/
// `previewCustomPdfImportCore` are the final "mapping (+ crop) confirmed"
// write-preview calls, same shape as `previewImportCore` above. The other
// three (`readRawXlsTableCore`/`getPdfPageCountCore`/
// `extractPdfCropPreviewCore`) back the client's page-selector/crop-
// editor/mapping-form round-trips *before* a mapping is confirmed — none
// of them touch the database, so they take no `db` parameter, unlike
// every Core function above.
export async function previewCustomXlsImportCore(db: Db, input: unknown): Promise<ActionResult<ImportPreview>> {
  const parsed = previewCustomXlsImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await previewCustomXlsImport(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export async function previewCustomPdfImportCore(db: Db, input: unknown): Promise<ActionResult<ImportPreview>> {
  const parsed = previewCustomPdfImportSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await previewCustomPdfImport(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export interface RawTableWithSuggestion {
  table: RawTable;
  suggestedMapping: Partial<ColumnMapping>;
}

export function readRawXlsTableCore(input: unknown): ActionResult<RawTableWithSuggestion> {
  const parsed = readRawXlsTableSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const table = readRawXlsTable(Buffer.from(parsed.data.fileBase64, "base64"));
    return ok({ table, suggestedMapping: suggestMappingFor(table) });
  } catch (error) {
    return fromThrown(error);
  }
}

export async function getPdfPageCountCore(input: unknown): Promise<ActionResult<number>> {
  const parsed = getPdfPageCountSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await getPdfPageCount(Buffer.from(parsed.data.fileBase64, "base64"), parsed.data.password));
  } catch (error) {
    return fromThrown(error);
  }
}

export async function extractPdfCropPreviewCore(input: unknown): Promise<ActionResult<RawTableWithSuggestion>> {
  const parsed = extractPdfCropPreviewSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const table = await extractPdfCropPreview(
      Buffer.from(parsed.data.fileBase64, "base64"),
      parsed.data.pages,
      parsed.data.password,
    );
    return ok({ table, suggestedMapping: suggestMappingFor(table) });
  } catch (error) {
    return fromThrown(error);
  }
}
