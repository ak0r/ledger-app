"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import { listCurrencies } from "../services/currencies";
import type { TradebookImportPreview, TradebookImportResult } from "../services/tradebookImport";
import { previewTradebookImportCore, runTradebookImportCore } from "./tradebookImport.core";
import type { ActionResult } from "./result";

// Stock tradebook import (Stock tradebook import plan, 2026-09-06) — same
// FormData + two-action preview/commit shape as CAS import
// (actions/casImport.ts), minus a password (a tradebook is never
// encrypted) and plus `folioId`/`portfolioAccountId` (the user already
// picked/created the destination before either call, since a tradebook
// carries no account identity of its own to resolve from).
export async function previewTradebookImportAction(formData: FormData): Promise<ActionResult<TradebookImportPreview>> {
  const { profile } = await requireActiveProfile();

  const file = formData.get("file");
  const folioId = formData.get("folioId");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Select a tradebook file to upload" };
  }

  const fileBytes = Buffer.from(await file.arrayBuffer());
  return previewTradebookImportCore(
    db,
    { profileId: profile.id, folioId: typeof folioId === "string" ? folioId : "" },
    fileBytes,
    file.name,
  );
}

// The only write path into Stock investment transactions — only ever
// called after the user has seen `previewTradebookImportAction`'s counts
// and explicitly confirmed.
export async function runTradebookImportAction(formData: FormData): Promise<ActionResult<TradebookImportResult>> {
  const { profile } = await requireActiveProfile();

  const file = formData.get("file");
  const portfolioAccountId = formData.get("portfolioAccountId");
  const folioId = formData.get("folioId");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Select a tradebook file to upload" };
  }
  if (typeof portfolioAccountId !== "string" || typeof folioId !== "string") {
    return { success: false, error: "Choose the Portfolio Account and Folio this tradebook belongs to" };
  }

  const currencies = listCurrencies(db, profile.id);
  const currency = currencies.find((c) => c.id === profile.primaryCurrencyId) ?? currencies[0];
  if (!currency) {
    return { success: false, error: "Set up a Currency first" };
  }

  const fileBytes = Buffer.from(await file.arrayBuffer());
  const result = await runTradebookImportCore(
    db,
    { profileId: profile.id, portfolioAccountId, folioId, currencyId: currency.id },
    fileBytes,
    file.name,
  );

  if (result.success) {
    revalidatePath("/portfolio");
    revalidatePath("/portfolio/stocks");
    revalidatePath("/portfolio/accounts");
    revalidatePath("/import-center");
  }
  return result;
}
