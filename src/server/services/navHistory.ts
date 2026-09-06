import { cashflowsFromTransactions, computeXirr, currentValue } from "@/core";
import type { Db } from "../persistence/client";
import {
  findLatestNav,
  findNavByInstrumentAndDate,
  findNavHistoryByInstrument,
  insertNavHistory,
  updateNavHistory,
  type NavHistoryRow,
} from "../repositories/navHistory";
import { computeCurrentPosition } from "./holdings";
import { listInvestmentTransactionsForInstrument } from "./investmentTransactions";

// The only real "no NAV" state today — one NAV provider (AMFI bulk,
// services/priceFeeds/amfiNav.ts), so "at least one nav_history row
// exists" vs. "none at all" is the only distinction that means anything
// yet (analysis/folioman-vs-ledger/09-valuation-dedup-and-charts-gap-
// analysis.md §2's own instruction not to build more stale states than
// there are providers to justify them).
export const NO_NAV_DATA_REASON = "No NAV data yet for this fund";

export interface RecordNavInput {
  instrumentId: string;
  date: string;
  nav: number;
  source?: string;
}

// Not Profile-scoped (schema.ts's own comment on `nav_history`) — a NAV is
// a market fact shared by every Profile holding this Instrument. Upsert by
// (instrumentId, date) — a real feed (services/navRefresh.ts) re-reports
// the same date on every refresh run once it's the most recent business
// day, and a same-day re-run must correct the value in place rather than
// accumulate duplicate rows for one date.
export function recordNav(db: Db, input: RecordNavInput): NavHistoryRow {
  const now = new Date().toISOString();
  const existing = findNavByInstrumentAndDate(db, input.instrumentId, input.date);
  if (existing) {
    const updated: NavHistoryRow = { ...existing, nav: input.nav, source: input.source ?? existing.source, updatedAt: now };
    updateNavHistory(db, existing.id, updated.nav, updated.source, now);
    return updated;
  }
  const row: NavHistoryRow = {
    id: crypto.randomUUID(),
    instrumentId: input.instrumentId,
    date: input.date,
    nav: input.nav,
    source: input.source ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertNavHistory(db, row);
  return row;
}

export function getLatestNav(db: Db, instrumentId: string): NavHistoryRow | undefined {
  return findLatestNav(db, instrumentId);
}

export function listNavHistory(db: Db, instrumentId: string): NavHistoryRow[] {
  return findNavHistoryByInstrument(db, instrumentId);
}

export interface InstrumentValuation {
  units: number;
  latestNav: number | undefined;
  value: number | undefined;
  // Present only when `latestNav` is undefined — why there's no price,
  // so the UI can say something better than a bare "—" (gap analysis §2).
  missingNavReason: string | undefined;
  // Annualized return since first transaction, or undefined when there
  // isn't enough to solve (no current value yet, fewer than 2 real cash
  // movements, or a rate genuinely doesn't exist for these flows —
  // core/portfolio/valuations/xirr.ts's own `computeXirr` contract).
  xirr: number | undefined;
}

// BUY/TRANSFER_IN are money the investor put in (an outflow from their
// pocket); SELL/TRANSFER_OUT/DIVIDEND are money the investor got back (an
// inflow) — DIVIDEND doesn't move units but is a real cash receipt XIRR
// must count, unlike the plain "invested" sum elsewhere in this codebase
// (portfolio-security-detail.tsx etc.) which deliberately leaves dividends
// out of cost basis. `cashflowsFromTransactions`' own sign convention is
// "positive = invested", so a real inflow is passed through negated.
function toXirrInvestedAmount(type: string, amount: number): number {
  return type === "BUY" || type === "TRANSFER_IN" ? amount : -amount;
}

// Current position x latest known NAV (core/portfolio/valuations/
// valuation.ts) — `currencyScale` is the caller's responsibility to
// resolve (there is no per-Instrument currency, docs/completed/
// 2026-08-21-Instrument-Model-Pricing-Foundations.md's own §2 "no price
// currency" rule), typically the Profile's own primary currency scale.
export function getInstrumentValuation(
  db: Db,
  profileId: string,
  instrumentId: string,
  currencyScale: number,
): InstrumentValuation {
  const units = computeCurrentPosition(db, profileId, instrumentId);
  const latest = getLatestNav(db, instrumentId);
  const value = currentValue(units, latest?.nav, currencyScale);
  const missingNavReason = latest === undefined ? NO_NAV_DATA_REASON : undefined;

  let xirr: number | undefined;
  if (value !== undefined) {
    // The terminal flow's date is the NAV's own observation date, not
    // wall-clock "today" — the value is only actually known as of when
    // the NAV was last recorded (which may lag today by a weekend/holiday
    // or an overdue refresh), and XIRR is sensitive to the exact date used.
    const transactions = listInvestmentTransactionsForInstrument(db, profileId, instrumentId);
    const flows = cashflowsFromTransactions(
      transactions.map((t) => ({ date: t.date, amount: toXirrInvestedAmount(t.type, t.amount) })),
      latest!.date,
      value,
    );
    xirr = computeXirr(flows) ?? undefined;
  }

  return { units, latestNav: latest?.nav, value, missingNavReason, xirr };
}
