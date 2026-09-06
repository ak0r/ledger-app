import { z } from "zod";
import type { NormalizedCatalogueInstrument } from "./types";

// A source record missing/empty an exchange code, or holding the literal
// string "null" (observed in the real IndianAPI stock feed — delta §2),
// normalizes to a real DB NULL rather than that string.
function normalizeCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

// IndianAPI stock feed shape (delta §2, observed against the real
// endpoint): a flat array of { id, name, "nse-code", "bse-code" }. Only
// `id`/`name` are required to keep a record — a row missing either can't
// be identified or displayed, so it's silently dropped rather than
// aborting the whole batch (one bad row must not sink 5000+ good ones).
const stockRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  "nse-code": z.string().nullable().optional(),
  "bse-code": z.string().nullable().optional(),
});

// Returns null when `raw` isn't even shaped like a stock feed (not an
// array at all) — the caller (use-cases/catalogue.ts) treats that as an
// unusable response and falls back to the next source, per delta §4/§9.
export function normalizeStockCatalogue(raw: unknown): NormalizedCatalogueInstrument[] | null {
  if (!Array.isArray(raw)) return null;

  const out: NormalizedCatalogueInstrument[] = [];
  for (const item of raw) {
    const parsed = stockRecordSchema.safeParse(item);
    if (!parsed.success) continue;
    out.push({
      sourceId: parsed.data.id,
      name: parsed.data.name,
      nseCode: normalizeCode(parsed.data["nse-code"]),
      bseCode: normalizeCode(parsed.data["bse-code"]),
      isin: null,
    });
  }
  return out;
}

// IndianAPI mutual-fund feed shape (delta §2 — "inspect the actual MF
// feed", verified against the real endpoint): not a flat array like
// stocks. It's an object keyed by category name (e.g. "Debt", "Equity"),
// each value an object keyed by sub-category name, each of those an array
// of fund records ({ id, mfMasterId, mfName, lastestNav, ... }). No NSE/
// BSE/ISIN in this feed — funds aren't exchange-traded the way stocks
// are — so every normalized record carries null for all three. NAV/
// returns/rating fields are pricing data (delta §8 non-goal) and are
// dropped entirely, not carried into the catalogue.
const mfRecordSchema = z.object({
  id: z.string().trim().min(1),
  mfName: z.string().trim().min(1),
});

// Returns null when `raw` isn't shaped like the category/sub-category
// nesting at all (not a plain object) — an unusable response, same
// fallback contract as normalizeStockCatalogue. A malformed category or
// sub-category value inside an otherwise-valid response is skipped, not
// treated as fatal — same one-bad-row-doesn't-sink-the-batch reasoning.
export function normalizeMutualFundCatalogue(raw: unknown): NormalizedCatalogueInstrument[] | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const out: NormalizedCatalogueInstrument[] = [];
  for (const subCategories of Object.values(raw as Record<string, unknown>)) {
    if (typeof subCategories !== "object" || subCategories === null || Array.isArray(subCategories)) continue;
    for (const funds of Object.values(subCategories as Record<string, unknown>)) {
      if (!Array.isArray(funds)) continue;
      for (const fund of funds) {
        const parsed = mfRecordSchema.safeParse(fund);
        if (!parsed.success) continue;
        out.push({
          sourceId: parsed.data.id,
          name: parsed.data.mfName,
          nseCode: null,
          bseCode: null,
          isin: null,
        });
      }
    }
  }
  return out;
}
