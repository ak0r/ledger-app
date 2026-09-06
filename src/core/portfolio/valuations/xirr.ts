// Extended Internal Rate of Return for irregular dated cashflows — the
// missing piece behind every Portfolio "Return / XIRR: Not available yet"
// (analysis/folioman-vs-ledger/09-valuation-dedup-and-charts-gap-analysis.md
// §2). Direct port of Folioman's own algorithm (core/src/folioman_core/
// xirr.py: Newton-Raphson with a bisection fallback) — a pure-math module
// with no I/O, framework-free like every other file in this directory.
// Rates solve in plain `number` (float) space, same posture as the
// original; cashflow *amounts* stay whatever Money-derived numbers the
// caller passes in (this module doesn't touch currency scale at all).

export interface CashFlow {
  date: string; // ISO date (YYYY-MM-DD)
  amount: number; // negative = outflow (money invested), positive = inflow (money received)
}

const TOLERANCE = 1e-7;
const MAX_NEWTON_ITERATIONS = 100;
const MAX_BISECTION_ITERATIONS = 200;
const BISECTION_LOW = -0.999999;
const BISECTION_HIGH = 100;

function yearFraction(start: string, when: string): number {
  const startMs = Date.parse(start);
  const whenMs = Date.parse(when);
  return (whenMs - startMs) / (1000 * 60 * 60 * 24 * 365);
}

function npv(rate: number, flows: readonly { year: number; amount: number }[]): number {
  return flows.reduce((sum, flow) => sum + flow.amount / Math.pow(1 + rate, flow.year), 0);
}

function npvDerivative(rate: number, flows: readonly { year: number; amount: number }[]): number {
  return flows.reduce((sum, flow) => sum - (flow.year * flow.amount) / Math.pow(1 + rate, flow.year + 1), 0);
}

// Bracketed fallback for when Newton-Raphson fails to converge.
function bisectXirr(flows: readonly { year: number; amount: number }[]): number | null {
  let low = BISECTION_LOW;
  let high = BISECTION_HIGH;
  let fLow = npv(low, flows);
  const fHigh = npv(high, flows);
  if (fLow > 0 === fHigh > 0) return null; // no sign change in the bracket — no locatable root here

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < TOLERANCE || (high - low) / 2 < TOLERANCE) return mid;
    if (fMid > 0 === fLow > 0) {
      low = mid;
      fLow = fMid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

// Returns the annualized XIRR as a decimal rate (e.g. `0.1` = 10%), or
// `null` when there are fewer than two flows, the flows aren't mixed-sign
// (a root needs at least one inflow and one outflow), or neither Newton-
// Raphson nor the bisection fallback can locate a rate.
export function computeXirr(cashflows: readonly CashFlow[], guess = 0.1): number | null {
  if (cashflows.length < 2) return null;

  const dated = [...cashflows].sort((a, b) => a.date.localeCompare(b.date));
  const hasInflow = dated.some((flow) => flow.amount > 0);
  const hasOutflow = dated.some((flow) => flow.amount < 0);
  if (!hasInflow || !hasOutflow) return null;

  const start = dated[0]!.date;
  const flows = dated.map((flow) => ({ year: yearFraction(start, flow.date), amount: flow.amount }));

  let rate = guess;
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const value = npv(rate, flows);
    if (Math.abs(value) < TOLERANCE) return rate;
    const derivative = npvDerivative(rate, flows);
    if (Math.abs(derivative) < TOLERANCE) break;
    let nextRate = rate - value / derivative;
    if (nextRate <= BISECTION_LOW) nextRate = BISECTION_LOW;
    if (Math.abs(nextRate - rate) < TOLERANCE) return nextRate;
    rate = nextRate;
  }

  return bisectXirr(flows);
}

// Builds XIRR inputs from `(date, investedAmount)` rows plus a terminal
// current value. Input sign convention (the inverse of `CashFlow`'s own):
// each `amount` is positive for money invested and is negated into an
// outflow here, so a negative input becomes an inflow (money received,
// e.g. a SELL/redemption). `presentValue` is the terminal current value,
// appended as a final inflow. Same-date rows are netted into one flow.
export function cashflowsFromTransactions(
  transactions: readonly { date: string; amount: number }[],
  presentDate: string,
  presentValue: number,
): CashFlow[] {
  const dated = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, number>();
  for (const { date, amount } of dated) {
    byDate.set(date, (byDate.get(date) ?? 0) + amount);
  }
  const flows: CashFlow[] = [...byDate.entries()].map(([date, total]) => ({ date, amount: -total }));
  flows.push({ date: presentDate, amount: presentValue });
  return flows;
}
