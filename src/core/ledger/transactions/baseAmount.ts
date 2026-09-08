import { multiplyRationalByInt, roundHalfEvenToInt, type Rational } from "../../shared/rational";

// The rounding + residual-ownership rule (Account Types, Money
// Representation, Rational Pricing, FX & Liability Details delta) — the
// single most load-bearing rule in that delta. Every non-primary leg's
// `base_amount` is independently half-even-rounded from its own exact
// rational value; the one primary/payment leg's `base_amount` is instead
// forced to the exact negative sum of every other leg's `base_amount`. This
// guarantees `SUM(base_amount) === 0` by construction, always — a
// transaction can never be rejected for a ±1 rounding mismatch, because
// nothing independently rounds the primary leg at all.
export function computeBaseAmounts(
  postings: readonly { units: number; price: Rational }[],
  primaryIndex: number,
): number[] {
  if (primaryIndex < 0 || primaryIndex >= postings.length) {
    throw new RangeError("primaryIndex out of range");
  }

  const baseAmounts = new Array<number>(postings.length);
  let residualSum = 0;

  postings.forEach((posting, index) => {
    if (index === primaryIndex) return;
    const { num, denom } = multiplyRationalByInt(posting.units, posting.price);
    const baseAmount = roundHalfEvenToInt(num, denom);
    baseAmounts[index] = baseAmount;
    residualSum += baseAmount;
  });

  baseAmounts[primaryIndex] = -residualSum;
  return baseAmounts;
}
