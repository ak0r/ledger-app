import { average, monthlyEquivalentAmount, monthWindow, trailingMonthWindows, type MonthWindow } from "@/core";
import type { Db } from "../persistence/client";
import { findAccountsByProfile } from "../repositories/accounts";
import { findBudgetPeriodsByBudget } from "../repositories/budgetPeriods";
import { listTransactions } from "./transactions";
import { listRecurringRulesWithNextDue } from "./recurring";
import { getAccountBalances } from "./accounts";
import { calculateBudgetActuals, listBudgetsWithSummary } from "./budgets";

// Dashboard System Phase 1 delta (2026-09-06) — the "list via an existing
// service function, reduce in JS with a Map" convention this codebase's
// other dashboard metrics already use (getExpenseTotalsByPeriod,
// getMonthlyCashflow), generalized to serve every one of this pass's 4
// panels rather than one bespoke aggregation per panel.

// Which posting side counts as "this classification's own activity" — an
// EXPENSE account is debit-normal (a debit posting is money leaving),
// an INCOME account is credit-normal (a credit posting is money
// received). Mirrors getExpenseTotalsByPeriod's own existing convention,
// generalized to also serve Income (Monthly Snapshot needs both).
function postingAmountFor(classification: "EXPENSE" | "INCOME", debit: number, credit: number): number {
  return classification === "EXPENSE" ? debit : credit;
}

// Sums one classification's activity within `[startIso, endIsoExclusive)`.
export function getClassificationTotalForWindow(
  db: Db,
  profileId: string,
  classification: "EXPENSE" | "INCOME",
  window: MonthWindow,
): number {
  const accountsById = new Map(findAccountsByProfile(db, profileId).map((account) => [account.id, account]));
  const transactions = listTransactions(db, profileId).filter(
    (t) => t.date >= window.startIso && t.date < window.endIsoExclusive,
  );

  let total = 0;
  for (const transaction of transactions) {
    for (const posting of transaction.postings) {
      if (accountsById.get(posting.accountId)?.classification !== classification) continue;
      total += postingAmountFor(classification, posting.debit, posting.credit);
    }
  }
  return total;
}

export interface MonthlyTotal {
  startIso: string;
  totalMinor: number;
}

// Trailing N calendar months' totals for one classification, oldest
// first — the series a rolling-average/trend panel compares "this month"
// against.
export function getMonthlyTotalsSeries(
  db: Db,
  profileId: string,
  classification: "EXPENSE" | "INCOME",
  monthCount: number,
  today: Date = new Date(),
): MonthlyTotal[] {
  return trailingMonthWindows(monthCount, today).map((window) => ({
    startIso: window.startIso,
    totalMinor: getClassificationTotalForWindow(db, profileId, classification, window),
  }));
}

// Day-bucketed (not month-bucketed) Expense totals for the heatmap panel —
// same list-then-reduce shape, keyed by exact date instead of month.
export function getDailyExpenseTotals(db: Db, profileId: string, fromIso: string, toIsoExclusive: string): Map<string, number> {
  const accountsById = new Map(findAccountsByProfile(db, profileId).map((account) => [account.id, account]));
  const transactions = listTransactions(db, profileId).filter((t) => t.date >= fromIso && t.date < toIsoExclusive);

  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    for (const posting of transaction.postings) {
      if (accountsById.get(posting.accountId)?.classification !== "EXPENSE") continue;
      if (posting.debit <= 0) continue;
      totals.set(transaction.date, (totals.get(transaction.date) ?? 0) + posting.debit);
    }
  }
  return totals;
}

export interface RecurringExpenseLine {
  id: string;
  name: string;
  toAccountName: string;
  monthlyEquivalentMinor: number;
}

export interface RecurringExpensesSummary {
  totalMonthlyEquivalentMinor: number;
  lines: RecurringExpenseLine[];
}

// Only rules with at least one future/current occurrence count as
// "active" (same definition `panel-eligibility.ts`'s own check uses) — an
// ended rule doesn't belong in "what am I currently committed to."
export function getRecurringExpensesSummary(db: Db, profileId: string, today: Date = new Date()): RecurringExpensesSummary {
  const accountsById = new Map(findAccountsByProfile(db, profileId).map((account) => [account.id, account]));
  const activeRules = listRecurringRulesWithNextDue(db, profileId, today).filter((rule) => rule.nextDue !== null);

  const lines: RecurringExpenseLine[] = activeRules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    toAccountName: accountsById.get(rule.toAccountId)?.name ?? "Unknown",
    monthlyEquivalentMinor: monthlyEquivalentAmount(rule.frequency, rule.interval, rule.amountMinor),
  }));

  return {
    totalMonthlyEquivalentMinor: lines.reduce((sum, line) => sum + line.monthlyEquivalentMinor, 0),
    lines: lines.sort((a, b) => b.monthlyEquivalentMinor - a.monthlyEquivalentMinor),
  };
}

export interface MonthlySnapshot {
  incomeMinor: number;
  spentMinor: number;
  savedMinor: number;
  savingsRatePercent: number | null; // null when income is 0 — an undefined rate, not a fabricated one
  previousIncomeMinor: number;
  previousSpentMinor: number;
  previousSavedMinor: number;
}

export function getMonthlySnapshot(db: Db, profileId: string, today: Date = new Date()): MonthlySnapshot {
  const currentWindow = monthWindow(today.getUTCFullYear(), today.getUTCMonth());
  const previousWindow = monthWindow(today.getUTCFullYear(), today.getUTCMonth() - 1);

  const incomeMinor = getClassificationTotalForWindow(db, profileId, "INCOME", currentWindow);
  const spentMinor = getClassificationTotalForWindow(db, profileId, "EXPENSE", currentWindow);
  const previousIncomeMinor = getClassificationTotalForWindow(db, profileId, "INCOME", previousWindow);
  const previousSpentMinor = getClassificationTotalForWindow(db, profileId, "EXPENSE", previousWindow);

  return {
    incomeMinor,
    spentMinor,
    savedMinor: incomeMinor - spentMinor,
    savingsRatePercent: incomeMinor > 0 ? ((incomeMinor - spentMinor) / incomeMinor) * 100 : null,
    previousIncomeMinor,
    previousSpentMinor,
    previousSavedMinor: previousIncomeMinor - previousSpentMinor,
  };
}

export interface SpendingTrend {
  thisMonthMinor: number;
  rollingAverageMinor: number;
  percentVsAverage: number | null;
}

// "This month vs a trailing rolling average" — `monthCount` excludes the
// current (still-in-progress) month from the average itself, comparing
// this month against the N months *before* it, not against itself.
export function getSpendingTrend(db: Db, profileId: string, monthCount = 6, today: Date = new Date()): SpendingTrend {
  const thisMonthMinor = getClassificationTotalForWindow(db, profileId, "EXPENSE", monthWindow(today.getUTCFullYear(), today.getUTCMonth()));
  const priorMonths = trailingMonthWindows(monthCount, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
  const priorTotals = priorMonths.map((window) => getClassificationTotalForWindow(db, profileId, "EXPENSE", window));
  const rollingAverageMinor = average(priorTotals);

  return {
    thisMonthMinor,
    rollingAverageMinor,
    percentVsAverage: rollingAverageMinor > 0 ? ((thisMonthMinor - rollingAverageMinor) / rollingAverageMinor) * 100 : null,
  };
}

export interface SavingsRateTrend {
  currentRatePercent: number | null; // null when this month has no income yet
  averageRatePercent: number | null; // null when no prior month with income exists
  deltaPoints: number | null; // percentage-point delta, current - average
}

// "How much of my income am I retaining, and is that changing?" (delta
// §7.3) — the delta's own worked example compares against a 3-month
// average specifically (not the 6-month window Spending Trend uses).
// Months with zero income are excluded from the average rather than
// counted as a 0% rate — a month with no income isn't evidence of a low
// savings rate, it's a month with nothing to rate.
export function getSavingsRateTrend(db: Db, profileId: string, monthCount = 3, today: Date = new Date()): SavingsRateTrend {
  const currentRatePercent = getMonthlySnapshot(db, profileId, today).savingsRatePercent;

  const priorWindows = trailingMonthWindows(monthCount, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
  const priorRates: number[] = [];
  for (const window of priorWindows) {
    const incomeMinor = getClassificationTotalForWindow(db, profileId, "INCOME", window);
    const spentMinor = getClassificationTotalForWindow(db, profileId, "EXPENSE", window);
    if (incomeMinor > 0) priorRates.push(((incomeMinor - spentMinor) / incomeMinor) * 100);
  }
  const averageRatePercent = priorRates.length > 0 ? average(priorRates) : null;

  return {
    currentRatePercent,
    averageRatePercent,
    deltaPoints: currentRatePercent !== null && averageRatePercent !== null ? currentRatePercent - averageRatePercent : null,
  };
}

export interface CreditCardHealth {
  thisMonthSpendMinor: number;
  averageSpendMinor: number;
  percentVsAverage: number | null;
  outstandingBalanceMinor: number;
}

// A Credit Card purchase credits the card account (increases the
// liability) — docs/03-accounting-principles.md's own worked example
// (Purchase: Expense DEBIT, Credit Card CREDIT). Scoped to
// `instrumentType === "CREDIT_CARD"` specifically, not every LIABILITY
// account (a Loan is a liability too, but not a card) — the delta's own
// rule: "must be explicitly configured/tagged as such," which
// `instrumentType` already is (a real user choice at account creation,
// never inferred from a name).
function getCreditCardSpendForWindow(db: Db, profileId: string, cardAccountIds: ReadonlySet<string>, window: MonthWindow): number {
  const transactions = listTransactions(db, profileId).filter((t) => t.date >= window.startIso && t.date < window.endIsoExclusive);
  let total = 0;
  for (const transaction of transactions) {
    for (const posting of transaction.postings) {
      if (!cardAccountIds.has(posting.accountId)) continue;
      total += posting.credit;
    }
  }
  return total;
}

// "Paid in full" bill-status detection is explicitly out of scope (a
// statement-cycle model or payment-matching heuristic — real complexity
// for one line, cut alongside this same panel's original scoping
// decision) — spend trend and outstanding balance only.
export function getCreditCardHealth(db: Db, profileId: string, monthCount = 3, today: Date = new Date()): CreditCardHealth {
  const cardAccounts = findAccountsByProfile(db, profileId).filter((account) => account.instrumentType === "CREDIT_CARD");
  const cardAccountIds = new Set(cardAccounts.map((account) => account.id));

  const thisMonthSpendMinor = getCreditCardSpendForWindow(db, profileId, cardAccountIds, monthWindow(today.getUTCFullYear(), today.getUTCMonth()));
  const priorWindows = trailingMonthWindows(monthCount, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
  const averageSpendMinor = average(priorWindows.map((window) => getCreditCardSpendForWindow(db, profileId, cardAccountIds, window)));

  const outstandingBalanceMinor = getAccountBalances(db, profileId)
    .filter((account) => account.instrumentType === "CREDIT_CARD")
    .reduce((sum, account) => sum + account.balance, 0);

  return {
    thisMonthSpendMinor,
    averageSpendMinor,
    percentVsAverage: averageSpendMinor > 0 ? ((thisMonthSpendMinor - averageSpendMinor) / averageSpendMinor) * 100 : null,
    outstandingBalanceMinor,
  };
}

export interface BudgetHealthLine {
  budgetId: string;
  budgetName: string;
  targetMinor: number;
  actualMinor: number;
  // Target scaled by how much of the Period has elapsed — null for a
  // ONE_TIME Budget (no date window to measure elapsed-ness against,
  // rule: Budgets §4.1) or a RECURRING Budget whose Period somehow has no
  // dates.
  expectedByTodayMinor: number | null;
  periodEndIso: string | null;
  // How many of its own past Periods (this Budget's real history, not an
  // estimate — Budget Periods are permanently frozen snapshots, unlike
  // Recurring Rules) were exceeded, out of how many considered.
  exceededCount: number;
  consideredPeriodCount: number;
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

// "Am I on track, based on time elapsed, not just amount spent?" (delta
// §7.9) — reuses `listBudgetsWithSummary`/`calculateBudgetActuals`
// (Budget Framework) rather than re-deriving actuals; the only new math
// here is the elapsed-time pacing and the historical exceeded-count,
// which Budget Periods' own persisted history already supports directly.
export function getBudgetHealth(db: Db, profileId: string, today: Date = new Date(), historyPeriodCount = 6): BudgetHealthLine[] {
  const todayIso = today.toISOString().slice(0, 10);

  return listBudgetsWithSummary(db, profileId, today)
    .filter((summary) => summary.actuals !== null)
    .map(({ budget, actuals }) => {
      const period = actuals!.period;
      let expectedByTodayMinor: number | null = null;
      if (period.startDate && period.endDate) {
        const totalDays = Math.max(1, daysBetweenIso(period.startDate, period.endDate) + 1);
        const elapsedDays = Math.min(totalDays, Math.max(0, daysBetweenIso(period.startDate, todayIso) + 1));
        expectedByTodayMinor = Math.round(actuals!.totalTargetMinor * (elapsedDays / totalDays));
      }

      const pastPeriods = findBudgetPeriodsByBudget(db, budget.id)
        .filter((p) => p.startDate && p.endDate && p.endDate < todayIso)
        .sort((a, b) => (a.startDate! < b.startDate! ? 1 : -1))
        .slice(0, historyPeriodCount);
      const exceededCount = pastPeriods.filter((p) => {
        const pastActuals = calculateBudgetActuals(db, p.id, profileId);
        return pastActuals.totalTargetMinor > 0 && pastActuals.totalActualMinor > pastActuals.totalTargetMinor;
      }).length;

      return {
        budgetId: budget.id,
        budgetName: budget.name,
        targetMinor: actuals!.totalTargetMinor,
        actualMinor: actuals!.totalActualMinor,
        expectedByTodayMinor,
        periodEndIso: period.endDate,
        exceededCount,
        consideredPeriodCount: pastPeriods.length,
      };
    });
}

export interface AttentionSignal {
  kind: "warning" | "good";
  message: string;
}

// "Show the user the few things worth looking at now" (delta §7.10) —
// consumes the other panels' own already-computed metrics, invents no new
// calculation of its own (delta's own rule). The specific trigger
// thresholds (15%/20%/5 points) aren't specified anywhere in the delta —
// this implementation's own judgment call, same posture as
// `BUDGET_REVIEW_WINDOW_DAYS` elsewhere in this codebase.
export function getAttentionSignals(db: Db, profileId: string, today: Date = new Date()): AttentionSignal[] {
  const signals: AttentionSignal[] = [];

  const spendingTrend = getSpendingTrend(db, profileId, 6, today);
  if (spendingTrend.percentVsAverage !== null && spendingTrend.percentVsAverage >= 15) {
    signals.push({ kind: "warning", message: `Spending is ${Math.round(spendingTrend.percentVsAverage)}% above your 6-month average.` });
  } else if (spendingTrend.percentVsAverage !== null && spendingTrend.percentVsAverage <= -15) {
    signals.push({ kind: "good", message: `Spending is ${Math.round(Math.abs(spendingTrend.percentVsAverage))}% below your 6-month average.` });
  }

  const cardHealth = getCreditCardHealth(db, profileId, 3, today);
  if (cardHealth.percentVsAverage !== null && cardHealth.percentVsAverage >= 20) {
    signals.push({ kind: "warning", message: `Credit card spending is ${Math.round(cardHealth.percentVsAverage)}% above your 3-month average.` });
  }

  const savingsTrend = getSavingsRateTrend(db, profileId, 3, today);
  if (savingsTrend.deltaPoints !== null && savingsTrend.deltaPoints >= 5) {
    signals.push({ kind: "good", message: `Savings rate is ${Math.round(savingsTrend.deltaPoints)} points above your 3-month average.` });
  } else if (savingsTrend.deltaPoints !== null && savingsTrend.deltaPoints <= -5) {
    signals.push({ kind: "warning", message: `Savings rate is ${Math.round(Math.abs(savingsTrend.deltaPoints))} points below your 3-month average.` });
  }

  const budgetHealth = getBudgetHealth(db, profileId, today);
  const atRisk = budgetHealth.filter((b) => b.expectedByTodayMinor !== null && b.actualMinor > b.expectedByTodayMinor);
  if (atRisk.length > 0) {
    signals.push({ kind: "warning", message: `${atRisk.length} budget${atRisk.length === 1 ? "" : "s"} running ahead of pace.` });
  } else if (budgetHealth.length > 0) {
    signals.push({ kind: "good", message: "No budgets currently at risk." });
  }

  return signals;
}
