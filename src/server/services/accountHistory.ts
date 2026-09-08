import { isDebitNormal } from "@/core";
import type { Db } from "../persistence/client";
import { findAccountById } from "../repositories/accounts";
import { findTransactionsByProfile, findPostingsByTransactionIds } from "../repositories/transactions";
import { NotFoundError } from "./errors";

export interface MonthlyCashflowPoint {
  month: string; // "2026-01"
  inflow: number; // minor units — postings that increased the balance
  outflow: number; // minor units — postings that decreased the balance
}

export interface BalanceTrendPoint {
  date: string; // "2026-01-15"
  balance: number; // running balance as of this date, minor units
}

// Both ISO "YYYY-MM-DD", inclusive, either end optional (open-ended) — the
// Insights tab's date-range selector (src/lib/insights-range.ts) resolves
// its presets down to this shape before calling in here.
export interface DateRange {
  from?: string;
  to?: string;
}

// Read-side aggregation only (docs/screen-contracts.md's "History = account
// balance history", explicitly not a Transaction audit/edit trail) — pure
// computation over existing postings/transactions, no new domain concept,
// no new persisted state. Unfiltered (no `range`) — callers slice by date
// afterward so the *opening balance* calculation below can still see every
// entry before the window starts.
function accountPostingsChronological(db: Db, profileId: string, accountId: string) {
  const account = findAccountById(db, accountId, profileId);
  if (!account) throw new NotFoundError(`Account ${accountId} not found for profile ${profileId}`);

  const transactions = findTransactionsByProfile(db, profileId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const postings = findPostingsByTransactionIds(
    db,
    transactions.map((t) => t.id),
  );
  const postingsByTransaction = new Map<string, typeof postings>();
  for (const posting of postings) {
    if (posting.accountId !== accountId) continue;
    const list = postingsByTransaction.get(posting.transactionId) ?? [];
    list.push(posting);
    postingsByTransaction.set(posting.transactionId, list);
  }

  const debitNormal = isDebitNormal(account.classification);
  const entries: { date: string; delta: number }[] = [];
  for (const transaction of transactions) {
    const matches = postingsByTransaction.get(transaction.id);
    if (!matches) continue;
    for (const posting of matches) {
      const delta = debitNormal ? posting.units : -posting.units;
      entries.push({ date: transaction.date, delta });
    }
  }
  return entries;
}

function inRange(date: string, range?: DateRange): boolean {
  if (range?.from && date < range.from) return false;
  if (range?.to && date > range.to) return false;
  return true;
}

// A trend restricted to a display window still needs to start from the
// *real* balance at that point, not zero — otherwise a window that opens
// mid-account-history would show a misleadingly low starting level. Sums
// every entry strictly before `range.from` first, then only plots points
// inside the window, continuing the running total from that real opening
// balance.
export function getBalanceTrend(
  db: Db,
  profileId: string,
  accountId: string,
  range?: DateRange,
): BalanceTrendPoint[] {
  const entries = accountPostingsChronological(db, profileId, accountId);
  const byDate = new Map<string, number>();
  for (const entry of entries) {
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.delta);
  }

  const sortedDates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  let running = 0;
  const points: BalanceTrendPoint[] = [];
  for (const [date, delta] of sortedDates) {
    if (range?.from && date < range.from) {
      running += delta;
      continue;
    }
    if (range?.to && date > range.to) continue;
    running += delta;
    points.push({ date, balance: running });
  }
  return points;
}

export function getMonthlyCashflow(
  db: Db,
  profileId: string,
  accountId: string,
  range?: DateRange,
): MonthlyCashflowPoint[] {
  const entries = accountPostingsChronological(db, profileId, accountId).filter((entry) =>
    inRange(entry.date, range),
  );
  const byMonth = new Map<string, { inflow: number; outflow: number }>();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const point = byMonth.get(month) ?? { inflow: 0, outflow: 0 };
    if (entry.delta > 0) point.inflow += entry.delta;
    else point.outflow += -entry.delta;
    byMonth.set(month, point);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, point]) => ({ month, ...point }));
}

export interface AccountRangeSummary {
  openingBalance: number;
  closingBalance: number;
  netChange: number;
  totalInflow: number;
  totalOutflow: number;
}

// The Insights tab's stats strip — "Value at start of selected period" /
// "Value at end" / "Net Change" / totals (the delta's own §6: "complementary
// rather than redundant" with the header's point-in-time Balance/Current
// Value card, since this is period-scoped). `openingBalance` sums every
// entry strictly before `range.from`, same real-history-aware calculation
// `getBalanceTrend` uses — not zero just because the window starts partway
// through the account's life.
export function getAccountRangeSummary(
  db: Db,
  profileId: string,
  accountId: string,
  range?: DateRange,
): AccountRangeSummary {
  const entries = accountPostingsChronological(db, profileId, accountId);
  let openingBalance = 0;
  let totalInflow = 0;
  let totalOutflow = 0;
  for (const entry of entries) {
    if (range?.from && entry.date < range.from) {
      openingBalance += entry.delta;
      continue;
    }
    if (range?.to && entry.date > range.to) continue;
    if (entry.delta > 0) totalInflow += entry.delta;
    else totalOutflow += -entry.delta;
  }
  const netChange = totalInflow - totalOutflow;
  return {
    openingBalance,
    closingBalance: openingBalance + netChange,
    netChange,
    totalInflow,
    totalOutflow,
  };
}
