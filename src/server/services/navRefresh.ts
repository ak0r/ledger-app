import type { Db } from "../persistence/client";
import { findAllInstruments } from "../repositories/instruments";
import { findMostRecentlyUpdatedNav } from "../repositories/navHistory";
import { fetchAmfiNavAll, type FetchText } from "../priceFeeds/amfiNav";
import { fetchNseLatestQuote, type RawFetch } from "../priceFeeds/nseEquityHistory";
import { fetchYahooLatestQuote } from "../priceFeeds/yahooFinance";
import { recordNav } from "./navHistory";

const AUTOMATIC_NAV_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24;

export interface NavRefreshResult {
  instrumentsChecked: number;
  instrumentsUpdated: number;
}

// Refreshes every catalogued Mutual Fund Instrument with a real identity
// (ISIN or AMFI code — services/casImport.ts resolves either) against the
// AMFI bulk feed in one request (analysis/folioman-vs-ledger/09-valuation-
// dedup-and-charts-gap-analysis.md §3). `fetchText` is injectable so this
// is testable against a synthetic fixture, same DI posture as
// services/casImport.ts's own `CasParserRunner` parameter.
async function refreshMutualFundNav(db: Db, fetchText?: FetchText): Promise<NavRefreshResult> {
  const navByKey = await fetchAmfiNavAll(fetchText);
  if (!navByKey) return { instrumentsChecked: 0, instrumentsUpdated: 0 };

  const instruments = findAllInstruments(db).filter(
    (instrument) => instrument.type === "MUTUAL_FUND" && (instrument.isin || instrument.amfiCode),
  );

  let instrumentsUpdated = 0;
  for (const instrument of instruments) {
    const point = (instrument.isin && navByKey.get(instrument.isin)) || (instrument.amfiCode && navByKey.get(instrument.amfiCode));
    if (!point) continue;
    recordNav(db, { instrumentId: instrument.id, date: point.date, nav: point.nav, source: "AMFI" });
    instrumentsUpdated += 1;
  }

  return { instrumentsChecked: instruments.length, instrumentsUpdated };
}

// One request per Stock — no bulk file exists for equities the way AMFI
// provides for the whole MF market (Stock tradebook import plan, Phase 2).
// Acceptable at expected self-hosted single-profile scale; revisit only if
// it becomes a real problem. `nseCode`/`bseCode` (not ISIN — both feeds
// take a trading symbol) are set at tradebook/eCAS-import time from the
// broker's or casparser's own symbol column — a Stock with neither yet is
// skipped, same "nothing to look up" posture as an MF Instrument with
// neither ISIN nor AMFI code. NSE is tried first (Folioman's own
// "NSE preferred, Yahoo is the fallback" framing, Phase 4) — Yahoo only
// runs on an NSE miss, not in parallel, so a healthy NSE never pays
// Yahoo's request cost.
async function refreshStockNav(db: Db, rawFetch?: RawFetch): Promise<NavRefreshResult> {
  const instruments = findAllInstruments(db).filter(
    (instrument) => instrument.type === "STOCK" && (instrument.nseCode || instrument.bseCode),
  );

  let instrumentsUpdated = 0;
  for (const instrument of instruments) {
    const nseQuote = instrument.nseCode ? await fetchNseLatestQuote(instrument.nseCode, rawFetch) : null;
    const quote = nseQuote ?? (await fetchYahooLatestQuote(instrument.nseCode, instrument.bseCode, rawFetch));
    if (!quote) continue;
    recordNav(db, {
      instrumentId: instrument.id,
      date: quote.date,
      nav: quote.price,
      source: nseQuote ? "NSE" : "YAHOO",
    });
    instrumentsUpdated += 1;
  }

  return { instrumentsChecked: instruments.length, instrumentsUpdated };
}

export async function refreshAllNav(
  db: Db,
  fetchText?: FetchText,
  rawFetch?: RawFetch,
): Promise<NavRefreshResult> {
  const mf = await refreshMutualFundNav(db, fetchText);
  const stocks = await refreshStockNav(db, rawFetch);
  return {
    instrumentsChecked: mf.instrumentsChecked + stocks.instrumentsChecked,
    instrumentsUpdated: mf.instrumentsUpdated + stocks.instrumentsUpdated,
  };
}

// Best-effort, opportunistic — same posture and rationale as services/
// backups.ts's `runBackupIfDue` (called from the exact same `after()`
// call site, src/app/(app)/layout.tsx): no background timer/cron (multi-
// worker and dev-reload risk, see backups.ts's own comment), "due" is
// derived from the history table's own most recent row rather than a
// separate settings row, and a request that happens to land after the
// interval has elapsed pays the one-time cost, not every request.
export async function runNavRefreshIfDue(db: Db, fetchText?: FetchText, rawFetch?: RawFetch): Promise<void> {
  const latest = findMostRecentlyUpdatedNav(db);
  const isDue = !latest || Date.now() - new Date(latest.updatedAt).getTime() >= AUTOMATIC_NAV_REFRESH_INTERVAL_MS;
  if (isDue) {
    await refreshAllNav(db, fetchText, rawFetch);
  }
}
