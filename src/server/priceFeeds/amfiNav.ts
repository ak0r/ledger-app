// AMFI bulk NAV feed (analysis/folioman-vs-ledger/09-valuation-dedup-and-
// charts-gap-analysis.md §3) — AMFI (the mutual-fund industry regulator)
// publishes every scheme's current NAV in one `;`-delimited text file,
// refreshed once a business day. One GET replaces a per-scheme call for
// every holding across every Profile, and — unlike a per-scheme query —
// this bulk file needs no identifying parameter at all, so nothing about
// which schemes any Profile holds is ever sent externally (stronger than
// AGENTS.md rule #23 already requires for a pricing provider).
//
// Injected as a parameter (not called directly by refreshAllNav) so the
// refresh flow is testable against a synthetic fixture string, same DI
// posture as services/catalogue.ts's own `FetchJson`.
export type FetchText = (url: string) => Promise<string | null>;

const NAV_ALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";
const REQUEST_TIMEOUT_MS = 30_000;

export const fetchTextOverHttp: FetchText = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
};

export interface AmfiNavPoint {
  date: string; // YYYY-MM-DD
  nav: number;
}

// Parses NAVAll.txt into `{ amfiCode | isin: AmfiNavPoint }` — a scheme's
// numeric AMFI code and its payout/growth/reinvest ISINs all map to the
// same point, so a caller looks it up by whichever identifier it stores
// (mirrors Folioman's own `parse_navall`, core/src/folioman_core/
// price_feeds/amfi_bulk.py). Non-data lines (header, blanks, bare AMC/
// scheme-type section names) have fewer than 5 `;` and are skipped; a row
// whose NAV is non-numeric ("N.A.") is skipped.
export function parseNavAll(text: string): Map<string, AmfiNavPoint> {
  const out = new Map<string, AmfiNavPoint>();
  for (const line of text.split("\n")) {
    const fields = line.split(";");
    if (fields.length < 5) continue;
    const [code, isinPayout, isinGrowth, , rawNav, rawDate] = fields;
    const nav = Number(rawNav?.trim());
    const date = parseAmfiDate(rawDate?.trim());
    if (!Number.isFinite(nav) || !date) continue;

    const point: AmfiNavPoint = { date, nav };
    for (const key of [code?.trim(), isinPayout?.trim(), isinGrowth?.trim()]) {
      if (key && key !== "-" && !out.has(key)) out.set(key, point);
    }
  }
  return out;
}

const AMFI_MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

// AMFI's own date format is "DD-Mon-YYYY" (e.g. "01-Jul-2026") — parsed by
// hand rather than `Date.parse` (locale/engine-dependent for non-ISO
// strings) into a plain YYYY-MM-DD string, matching every other date
// column in this codebase.
function parseAmfiDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(raw);
  if (!match) return null;
  const [, day, mon, year] = match;
  const month = AMFI_MONTHS[mon as keyof typeof AMFI_MONTHS];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

export async function fetchAmfiNavAll(fetchText: FetchText = fetchTextOverHttp): Promise<Map<string, AmfiNavPoint> | null> {
  const text = await fetchText(NAV_ALL_URL);
  if (!text) return null;
  return parseNavAll(text);
}
