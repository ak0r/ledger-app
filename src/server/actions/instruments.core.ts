import type { Db } from "../persistence/client";
import { createInstrument, searchInstruments } from "../services/instruments";
import { refreshInstrumentCatalogue } from "../services/catalogue";
import type { InstrumentRow } from "../repositories/instruments";
import type { CatalogueRefreshResult } from "../services/catalogue";
import { createInstrumentSchema, refreshInstrumentCatalogueSchema, searchInstrumentsSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function searchInstrumentsCore(db: Db, input: unknown): ActionResult<InstrumentRow[]> {
  const parsed = searchInstrumentsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(searchInstruments(db, parsed.data.type, parsed.data.query));
  } catch (error) {
    return fromThrown(error);
  }
}

export function createInstrumentCore(db: Db, input: unknown): ActionResult<InstrumentRow> {
  const parsed = createInstrumentSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createInstrument(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

// Instrument Catalogue delta (2026-09-04) §9 — the "development/admin
// operation" the delta says is sufficient without a catalogue-management
// screen. No UI calls this yet; it exists so the ingestion flow is
// reachable through the same action/core layering as everything else,
// ready for whatever eventually triggers it (a settings button, a cron).
export async function refreshInstrumentCatalogueCore(
  db: Db,
  input: unknown,
): Promise<ActionResult<CatalogueRefreshResult>> {
  const parsed = refreshInstrumentCatalogueSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(await refreshInstrumentCatalogue(db, parsed.data.type));
  } catch (error) {
    return fromThrown(error);
  }
}
