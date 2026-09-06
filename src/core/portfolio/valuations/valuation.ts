import { fromQuantityMinorUnits, type Quantity } from "../../shared/quantity";

// Current valuation = held units x latest known NAV/price (Portfolio
// Adoption Plan §1 "NAV / valuation foundation"). Deliberately just this
// one multiplication — no historical portfolio-value series, no
// provider/refresh machinery (plan §3 "Later"/§4 "Maybe"). `latestNav` is
// whatever the caller resolved as the most recent `nav_history` row for
// this Instrument; a missing NAV means no valuation can be computed at
// all (undefined), never a silent zero.
export function currentValue(
  units: Quantity,
  latestNav: number | undefined,
  currencyScale: number,
): number | undefined {
  if (latestNav === undefined) return undefined;
  return Math.round(fromQuantityMinorUnits(units) * latestNav * 10 ** currencyScale);
}
