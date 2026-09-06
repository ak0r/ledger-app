// Quantity as integer minor units at a fixed 6-decimal scale (Revised
// Investment Model delta, 2026-09-03) — same reasoning as Money's own
// integer-minor-units rule (ADR-022, domain/money.ts): summed across
// transactions for holdings derivation, where float drift would compound.
// Unlike Money, the scale is fixed and global, not per-Currency — a
// Quantity isn't always a currency amount (Instrument units), so there's
// no natural "owning" Currency to take a scale from. 6 decimals
// comfortably covers stock fractional shares, mutual fund units, and
// commodity weights without truncation.
export type Quantity = number;

export const QUANTITY_SCALE = 6;

export function toQuantityMinorUnits(amount: number): Quantity {
  return Math.round(amount * 10 ** QUANTITY_SCALE);
}

export function fromQuantityMinorUnits(amount: Quantity): number {
  return amount / 10 ** QUANTITY_SCALE;
}
