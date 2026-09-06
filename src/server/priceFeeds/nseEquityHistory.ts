// NSE security-wise historical price feed (analysis/folioman-vs-ledger/09-
// valuation-dedup-and-charts-gap-analysis.md §3, Stock tradebook import
// plan §Phase 2) — the primary equity price source Folioman itself uses
// (core/src/folioman_core/price_feeds/nse_history.py), scaled down: Ledger
// only ever needs the *latest* close for a held stock (services/
// navRefresh.ts's daily refresh), never a historical backfill, so this
// fetches a short recent window and keeps the newest point instead of
// porting Folioman's full multi-year chunked-backfill machinery.
//
// The endpoint sits behind NSE's cookie wall — a plain request is rejected
// until a browser-like session cookie is obtained from a prior page load.
// Same "fail silently, never crash" posture as services/priceFeeds/
// amfiNav.ts: any failure (network, cookie wall, non-CSV WAF response)
// returns `null`, not a thrown error — a NAV refresh's whole point is to
// be best-effort, and this feed is meaningfully more fragile than AMFI's
// clean public bulk file (flagged in the migration plan, not a surprise).
import Papa from "papaparse";
import { MONTHS } from "../importers/shared";

export type RawFetch = typeof fetch;

const NSE_BASE_URL = "https://www.nseindia.com";
const HISTORY_PATH = "/api/historicalOR/generateSecurityWiseHistoricalData";
const REFERER = `${NSE_BASE_URL}/report-detail/eq_security`;
const LOOKBACK_DAYS = 10; // a business week plus slack for weekends/holidays
const REQUEST_TIMEOUT_MS = 15_000;
// A plain server-side fetch gets rejected outright without a browser-like
// User-Agent — NSE's WAF checks for one even before the cookie wall.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function formatParamDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export interface EquityQuote {
  date: string; // YYYY-MM-DD
  price: number;
}

// The CSV's own date column is "DD-Mon-YYYY" (e.g. "08-Jun-2026") — headers
// and quoted values carry a UTF-8 BOM/whitespace NSE's export always
// includes, and quoted numeric fields use Indian comma grouping
// ("1,263.30") — a plain `split(",")` would wrongly split those values, so
// this parses with Papa Parse (already a dependency, same as every other
// adapter in this codebase) rather than hand-rolling CSV splitting.
export function parseNseHistoryCsv(text: string): EquityQuote[] {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    // NSE's real export pads header cells with trailing spaces ("Date  ").
    transformHeader: (header) => header.trim(),
  });

  const points: EquityQuote[] = [];
  for (const record of result.data) {
    const rawDate = record.Date?.trim();
    const rawClose = record["Close Price"]?.replace(/,/g, "").trim();
    if (!rawDate || !rawClose) continue;

    const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(rawDate);
    const month = match ? MONTHS[match[2]!.toLowerCase()] : undefined;
    const price = Number(rawClose);
    if (!match || !month || !Number.isFinite(price)) continue;

    points.push({ date: `${match[3]}-${month}-${match[1]}`, price });
  }
  return points;
}

// Warms an NSE session cookie, then fetches the latest close for `symbol`
// over a short recent window. Returns the single most recent point, or
// `null` on any failure (unreachable, WAF/non-CSV response, no rows).
// `rawFetch` is injectable so this is testable against canned Responses
// without a real network call — same DI posture as amfiNav.ts's
// `fetchText`.
export async function fetchNseLatestQuote(symbol: string, rawFetch: RawFetch = fetch): Promise<EquityQuote | null> {
  if (!symbol) return null;
  try {
    const warmup = await rawFetch(REFERER, {
      headers: { "User-Agent": BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const cookie = warmup.headers.get("set-cookie") ?? "";

    const end = new Date();
    const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      from: formatParamDate(start),
      to: formatParamDate(end),
      symbol: symbol.toUpperCase(),
      type: "priceVolumeDeliverable",
      series: "EQ",
      csv: "true",
    });

    const response = await rawFetch(`${NSE_BASE_URL}${HISTORY_PATH}?${params.toString()}`, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Referer: REFERER, Cookie: cookie },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    // NSE serves an HTML error/WAF page (not CSV) when throttling — treat
    // that as "no data" rather than parse garbage.
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("csv") && !contentType.includes("text/plain")) return null;

    const points = parseNseHistoryCsv(await response.text());
    if (points.length === 0) return null;
    return points.reduce((latest, point) => (point.date > latest.date ? point : latest));
  } catch {
    return null;
  }
}
