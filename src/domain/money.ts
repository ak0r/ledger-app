// Money as integer minor units (ADR-022). Never floating-point.
export type Money = number;

export function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Conversion between a decimal display amount (what a user types, e.g.
// "50.25") and integer minor units (what's persisted). Currency owns the
// scale (ADR-022) — callers pass the Currency's minorUnitScale, never a
// hardcoded assumption.
export function toMinorUnits(amount: number, scale: number): Money {
  return Math.round(amount * 10 ** scale);
}

export function fromMinorUnits(amount: Money, scale: number): number {
  return amount / 10 ** scale;
}
