"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { EcasImportPreview, EcasImportResult } from "../services/ecasImport";
import { previewEcasImportCore, runEcasImportCore } from "./ecasImport.core";
import type { ActionResult } from "./result";

// Demat eCAS PDF import (Stock tradebook import plan, Phase 3) — same
// FormData/two-step preview-then-commit shape as CAS import
// (actions/casImport.ts); the PDF's bytes and password are read once here
// and handed to the core function as trusted parameters.
export async function previewEcasImportAction(formData: FormData): Promise<ActionResult<EcasImportPreview>> {
  const { profile } = await requireActiveProfile();

  const file = formData.get("file");
  const password = formData.get("password");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Select an eCAS PDF to upload" };
  }

  const pdfBytes = Buffer.from(await file.arrayBuffer());
  return previewEcasImportCore(
    db,
    { profileId: profile.id, password: typeof password === "string" ? password : "" },
    pdfBytes,
  );
}

// The only write path into Portfolio Holdings from an eCAS — only ever
// called after the user has seen `previewEcasImportAction`'s counts and
// explicitly confirmed (`EcasImportForm`'s two-step flow).
export async function runEcasImportAction(formData: FormData): Promise<ActionResult<EcasImportResult>> {
  const { profile } = await requireActiveProfile();

  const file = formData.get("file");
  const password = formData.get("password");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Select an eCAS PDF to upload" };
  }

  const pdfBytes = Buffer.from(await file.arrayBuffer());
  const result = await runEcasImportCore(
    db,
    { profileId: profile.id, password: typeof password === "string" ? password : "", filename: file.name },
    pdfBytes,
  );

  if (result.success) {
    revalidatePath("/portfolio");
    revalidatePath("/portfolio/stocks");
    revalidatePath("/import-center");
  }
  return result;
}
