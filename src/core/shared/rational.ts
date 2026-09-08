// Exact rational arithmetic for money/pricing (Account Types, Money
// Representation, Rational Pricing, FX & Liability Details delta) — no
// floating-point in money/rate calculations. `Rational` is a strictly
// positive, always-reduced fraction: a Posting's sign lives on its own
// signed `units`/`baseAmount`, never on the price ratio itself.
export interface Rational {
  num: number;
  denom: number;
}

export class RationalOverflowError extends Error {
  constructor() {
    super("Rational arithmetic result exceeds Number.MAX_SAFE_INTEGER");
    this.name = "RationalOverflowError";
  }
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y !== ZERO) {
    [x, y] = [y, x % y];
  }
  return x;
}

function bigIntToSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new RationalOverflowError();
  }
  return Number(value);
}

// Both `num` and `denom` must be positive integers (the delta's own
// explicit requirement) — this is a valuation ratio, never a signed amount.
export function makeRational(num: number, denom: number): Rational {
  if (!Number.isInteger(num) || !Number.isInteger(denom) || num <= 0 || denom <= 0) {
    throw new RangeError("Rational num/denom must be positive integers");
  }
  const divisor = bigIntToSafeNumber(gcdBigInt(BigInt(num), BigInt(denom)));
  return { num: num / divisor, denom: denom / divisor };
}

// Exact `units * price`, kept as an unreduced BigInt fraction — the
// multiply itself can never silently overflow since BigInt is arbitrary
// precision; only reducing/rounding back to a `number` can throw.
export function multiplyRationalByInt(units: number, r: Rational): { num: bigint; denom: bigint } {
  return { num: BigInt(units) * BigInt(r.num), denom: BigInt(r.denom) };
}

// Round `num/denom` to the nearest integer, ties to even (banker's
// rounding) — the delta's specified rule for a rational -> integer
// minor-unit boundary. `denom` must be positive.
export function roundHalfEvenToInt(num: bigint, denom: bigint): number {
  if (denom <= ZERO) {
    throw new RangeError("roundHalfEvenToInt denom must be positive");
  }
  const negative = num < ZERO;
  const n = negative ? -num : num;
  const quotient = n / denom;
  const remainder = n % denom;
  const twiceRemainder = remainder * TWO;
  let rounded = quotient;
  if (twiceRemainder > denom || (twiceRemainder === denom && quotient % TWO === ONE)) {
    rounded += ONE;
  }
  return bigIntToSafeNumber(negative ? -rounded : rounded);
}

// Convert a UI-entered decimal (e.g. Currency Settings' "83.25") into an
// exact reduced Rational via a fixed-precision denominator — avoids
// repeating-decimal/float-parsing ambiguity while keeping the input plain.
export function decimalToRational(decimal: number, precision = 8): Rational {
  if (!(decimal > 0)) {
    throw new RangeError("decimalToRational requires a positive value");
  }
  const scale = 10 ** precision;
  const num = Math.round(decimal * scale);
  if (num <= 0) {
    throw new RangeError("decimalToRational requires a positive value");
  }
  return makeRational(num, scale);
}

// FX Rate UX delta — the standard one-unit quotation shown/entered in the
// UI ("1 JPY = ₹0.5800") is a *major*-unit statement, but a CurrencyRate's
// stored `rate_num`/`rate_denom` is a *minor*-unit-to-minor-unit ratio (the
// same shape Posting pricing uses — see core/ledger/transactions/
// posting.ts). Major-unit parity does not imply minor-unit parity once the
// two currencies have different minor-unit scales (e.g. JPY scale 0 vs INR
// scale 2: "1 JPY = ₹0.58" is 58 paise per 1 JPY, i.e. a 58/1 minor-unit
// ratio, not 0.58/1). These two functions are exact inverses and are the
// only place this scale adjustment happens — every other rational
// operation in this module is currency-agnostic.
export function decimalRateToMinorRational(decimal: number, currencyScale: number, baseCurrencyScale: number): Rational {
  const exact = decimalToRational(decimal);
  const scaleDelta = baseCurrencyScale - currencyScale;
  return scaleDelta >= 0
    ? makeRational(exact.num * 10 ** scaleDelta, exact.denom)
    : makeRational(exact.num, exact.denom * 10 ** -scaleDelta);
}

export function minorRationalToDecimalRate(rational: Rational, currencyScale: number, baseCurrencyScale: number): number {
  const scaleDelta = baseCurrencyScale - currencyScale;
  return rational.num / rational.denom / 10 ** scaleDelta;
}
