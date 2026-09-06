"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import { listCurrencies } from "../services/currencies";
import type { CasImportPreview, CasImportResult } from "../services/casImport";
import { previewCasImportCore, runCasImportCore } from "./casImport.core";
import type { ActionResult } from "./result";

// CAS PDF import (Portfolio UI/Navigation Model delta, 2026-09-05 §8;
// review-step correction 2026-09-05) — FormData, not a JSON object, since
// it carries a real file upload; the PDF's bytes and password are read
// once here and handed to the core function as trusted parameters (never
// Zod-validated as "input shape" — they're binary/secret, not a form
// shape to check).
//
// Preview parses and counts only — nothing is persisted (services/
// casImport.ts's `previewCasImport`), so it needs no Currency at all.
export async function previewCasImportAction(formData: FormData): Promise<ActionResult<CasImportPreview>> {
  const { profile } = await requireActiveProfile();

  const file = formData.get("file");
  const password = formData.get("password");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Select a CAS PDF to upload" };
  }

  const pdfBytes = Buffer.from(await file.arrayBuffer());
  return previewCasImportCore(
    db,
    { profileId: profile.id, password: typeof password === "string" ? password : "" },
    pdfBytes,
  );
}

// The only write path into Portfolio investment transactions — only ever
// called after the user has seen `previewCasImportAction`'s counts and
// explicitly confirmed (`CasImportForm`'s two-step flow).
export async function runCasImportAction(formData: FormData): Promise<ActionResult<CasImportResult>> {
  const { profile } = await requireActiveProfile();

  const file = formData.get("file");
  const password = formData.get("password");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Select a CAS PDF to upload" };
  }

  const currencies = listCurrencies(db, profile.id);
  const currency = currencies.find((c) => c.id === profile.primaryCurrencyId) ?? currencies[0];
  if (!currency) {
    return { success: false, error: "Set up a Currency first" };
  }

  const pdfBytes = Buffer.from(await file.arrayBuffer());
  const result = await runCasImportCore(
    db,
    {
      profileId: profile.id,
      password: typeof password === "string" ? password : "",
      filename: file.name,
      currencyId: currency.id,
    },
    pdfBytes,
  );

  if (result.success) {
    revalidatePath("/portfolio");
    revalidatePath("/portfolio/mutual-funds");
    revalidatePath("/portfolio/stocks");
    revalidatePath("/import-center");
  }
  return result;
}
