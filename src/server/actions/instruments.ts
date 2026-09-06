"use server";

import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { InstrumentRow } from "../repositories/instruments";
import type { CatalogueRefreshResult } from "../services/catalogue";
import {
  createInstrumentCore,
  refreshInstrumentCatalogueCore,
  searchInstrumentsCore,
} from "./instruments.core";
import type { ActionResult } from "./result";

// Instruments aren't Profile-scoped (schema.ts's own doc comment on the
// `instruments` table — one shared catalogue) — `requireActiveProfile`
// here is just the auth gate every Server Action has, not a scope filter.
export async function searchInstrumentsAction(input: unknown): Promise<ActionResult<InstrumentRow[]>> {
  await requireActiveProfile();
  return searchInstrumentsCore(db, input);
}

export async function createInstrumentAction(input: unknown): Promise<ActionResult<InstrumentRow>> {
  await requireActiveProfile();
  return createInstrumentCore(db, input);
}

export async function refreshInstrumentCatalogueAction(
  input: unknown,
): Promise<ActionResult<CatalogueRefreshResult>> {
  await requireActiveProfile();
  return refreshInstrumentCatalogueCore(db, input);
}
