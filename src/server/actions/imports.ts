"use server";

import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { ImportFileRow } from "../repositories/importFiles";
import type { ImportPreview } from "../services/imports";
import {
  commitImportCore,
  previewImportCore,
  previewCustomXlsImportCore,
  previewCustomPdfImportCore,
  readRawXlsTableCore,
  getPdfPageCountCore,
  extractPdfCropPreviewCore,
  type RawTableWithSuggestion,
} from "./imports.core";
import type { ActionResult } from "./result";

export async function previewImportAction(input: unknown): Promise<ActionResult<ImportPreview>> {
  const { profile } = await requireActiveProfile();
  return previewImportCore(db, { ...(input as object), profileId: profile.id });
}

export async function commitImportAction(input: unknown): Promise<ActionResult<ImportFileRow[]>> {
  const { profile } = await requireActiveProfile();
  return commitImportCore(db, { ...(input as object), profileId: profile.id });
}

// Ledger Custom Importer delta. The three "config round-trip" actions
// below require a logged-in session (the same auth gate as every action
// here) but touch no Profile data — nothing is injected into their input.
export async function previewCustomXlsImportAction(input: unknown): Promise<ActionResult<ImportPreview>> {
  const { profile } = await requireActiveProfile();
  return previewCustomXlsImportCore(db, { ...(input as object), profileId: profile.id });
}

export async function previewCustomPdfImportAction(input: unknown): Promise<ActionResult<ImportPreview>> {
  const { profile } = await requireActiveProfile();
  return previewCustomPdfImportCore(db, { ...(input as object), profileId: profile.id });
}

export async function readRawXlsTableAction(input: unknown): Promise<ActionResult<RawTableWithSuggestion>> {
  await requireActiveProfile();
  return readRawXlsTableCore(input);
}

export async function getPdfPageCountAction(input: unknown): Promise<ActionResult<number>> {
  await requireActiveProfile();
  return getPdfPageCountCore(input);
}

export async function extractPdfCropPreviewAction(input: unknown): Promise<ActionResult<RawTableWithSuggestion>> {
  await requireActiveProfile();
  return extractPdfCropPreviewCore(input);
}
