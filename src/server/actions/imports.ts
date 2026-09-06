"use server";

import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { ImportFileRow } from "../repositories/importFiles";
import type { ImportPreview } from "../services/imports";
import { commitImportCore, previewImportCore } from "./imports.core";
import type { ActionResult } from "./result";

export async function previewImportAction(input: unknown): Promise<ActionResult<ImportPreview>> {
  const { profile } = await requireActiveProfile();
  return previewImportCore(db, { ...(input as object), profileId: profile.id });
}

export async function commitImportAction(input: unknown): Promise<ActionResult<ImportFileRow[]>> {
  const { profile } = await requireActiveProfile();
  return commitImportCore(db, { ...(input as object), profileId: profile.id });
}
