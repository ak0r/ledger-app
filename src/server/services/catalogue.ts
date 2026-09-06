import type { Db } from "../persistence/client";
import { upsertCatalogueInstruments } from "../repositories/instruments";
import { normalizeMutualFundCatalogue, normalizeStockCatalogue } from "../catalogue/normalize";
import type { CatalogueInstrumentType, NormalizedCatalogueInstrument } from "../catalogue/types";

// Fetches and JSON-parses one URL, returning null on any failure (network
// error, timeout, non-2xx, malformed JSON) instead of throwing — the
// caller below treats null exactly like "this source is unusable, try the
// next one" (delta §4/§9), the same outcome as a structurally-wrong body.
// Injected as a parameter (not called directly by refreshInstrumentCatalogue)
// so ingestion-flow tests can stub it instead of hitting the real network.
export type FetchJson = (url: string) => Promise<unknown | null>;

const REQUEST_TIMEOUT_MS = 15_000;

export const fetchJsonOverHttp: FetchJson = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

// Analyst primary, Pro fallback, for each Instrument type this delta
// ingests a catalogue for (delta §1) — COMMODITY has no source yet.
const SOURCE_URLS: Record<CatalogueInstrumentType, readonly string[]> = {
  STOCK: [
    "https://analyst.indianapi.in/static/all_stocks.json",
    "https://pro.indianapi.in/static/all_stocks.json",
  ],
  MUTUAL_FUND: [
    "https://analyst.indianapi.in/static/all_mf.json",
    "https://pro.indianapi.in/static/all_mf.json",
  ],
};

const NORMALIZE_BY_TYPE: Record<
  CatalogueInstrumentType,
  (raw: unknown) => NormalizedCatalogueInstrument[] | null
> = {
  STOCK: normalizeStockCatalogue,
  MUTUAL_FUND: normalizeMutualFundCatalogue,
};

export interface CatalogueRefreshResult {
  // Which source actually produced usable data ("analyst" | "pro"), or
  // null when both failed — the ingestion flow's own §4 diagram: fetch
  // Analyst, fall back to Pro on failure/unusable response.
  source: "analyst" | "pro" | null;
  upserted: number;
}

// refreshInstrumentCatalogue(type) — delta §4's ingestion flow. Never
// called from application startup or from account/transaction code paths
// (delta §4's own "do not" list); this is the admin/dev-triggered
// operation delta §9 says is sufficient without a catalogue-management
// screen. A response that's unusable from every source leaves the local
// catalogue exactly as it was — upsertCatalogueInstruments is strictly
// additive/updating and is simply never called in that case, which is
// also what makes "preserve existing local records" true by construction
// rather than a separate rule to get right.
export async function refreshInstrumentCatalogue(
  db: Db,
  type: CatalogueInstrumentType,
  fetchJson: FetchJson = fetchJsonOverHttp,
): Promise<CatalogueRefreshResult> {
  const urls = SOURCE_URLS[type];
  const normalize = NORMALIZE_BY_TYPE[type];
  const labels = ["analyst", "pro"] as const;

  for (let i = 0; i < urls.length; i++) {
    const raw = await fetchJson(urls[i]);
    if (raw === null) continue;

    const normalized = normalize(raw);
    if (normalized === null || normalized.length === 0) continue;

    const upserted = db.transaction((tx) =>
      upsertCatalogueInstruments(tx, type, "INDIANAPI", normalized),
    );
    return { source: labels[i], upserted };
  }

  return { source: null, upserted: 0 };
}
