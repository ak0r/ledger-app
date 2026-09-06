// Yahoo Finance fallback equity price feed (Stock tradebook import plan,
// Phase 4) — Folioman's own documented fallback
// (core/src/folioman_core/price_feeds/yfinance_feed.py) for when NSE's
// cookie-walled scrape (priceFeeds/nseEquityHistory.ts) fails. No auth, no
// cookie wall, but Indian equities need an exchange suffix Yahoo's own
// symbol namespace requires (`.NS` for NSE, `.BO` for BSE) — built from
// the same `instruments.nseCode`/`bseCode` columns the NSE feed and
// tradebook/eCAS import already populate, no new column needed.
// Same "fail silently, never crash" posture as every other price feed in
// this codebase: any failure returns `null`, never throws.
export type RawFetch = typeof fetch;

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const REQUEST_TIMEOUT_MS = 15_000;
// A short window, same reasoning as nseEquityHistory's own LOOKBACK_DAYS —
// only the latest close is ever needed, this just gives enough slack to
// land on the most recent trading day.
const RANGE = "5d";

export interface EquityQuote {
  date: string; // YYYY-MM-DD
  price: number;
}

function buildYahooSymbol(nseCode: string | null, bseCode: string | null): string | null {
  if (nseCode) return `${nseCode}.NS`;
  if (bseCode) return `${bseCode}.BO`;
  return null;
}

interface YahooChartResponse {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
  };
}

// Walks timestamp/close arrays backwards for the most recent non-null
// pair — Yahoo pads both arrays with a trailing null when the most recent
// bar (e.g. today, mid-session) hasn't closed yet.
export function parseYahooChart(json: unknown): EquityQuote | null {
  const result = (json as YahooChartResponse)?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) return null;

  for (let i = timestamps.length - 1; i >= 0; i--) {
    const price = closes[i];
    const timestamp = timestamps[i];
    if (price == null || timestamp == null) continue;
    return { date: new Date(timestamp * 1000).toISOString().slice(0, 10), price };
  }
  return null;
}

// `rawFetch` is injectable so this is testable against a canned Response
// without a real network call — same DI posture as nseEquityHistory.ts's
// `fetchNseLatestQuote`.
export async function fetchYahooLatestQuote(
  nseCode: string | null,
  bseCode: string | null,
  rawFetch: RawFetch = fetch,
): Promise<EquityQuote | null> {
  const symbol = buildYahooSymbol(nseCode, bseCode);
  if (!symbol) return null;

  try {
    const params = new URLSearchParams({ interval: "1d", range: RANGE });
    const response = await rawFetch(`${YAHOO_CHART_URL}/${symbol}?${params.toString()}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseYahooChart(await response.json());
  } catch {
    return null;
  }
}
