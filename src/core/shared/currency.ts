export interface CurrencyDefinition {
  code: string;
  name: string;
  symbol: string;
  minorUnitScale: number;
}

// Currency Catalogue (2026-09-03 Settings/Backup/Data Management delta) —
// a system-maintained, mostly-static reference list, not a DB table. This
// is what an "Add Currency" picker chooses from; the `currencies` table
// stays a per-Profile instantiation record of a code drawn from here.
// Supersedes the earlier INR-only freeze (rule #7, ADR-020) per explicit
// user direction to lift it now rather than scaffold around it. Still no
// FX/conversion — see domain/transaction.ts's MIXED_CURRENCY_UNSUPPORTED.
export const CURRENCY_CATALOG: readonly CurrencyDefinition[] = [
  { code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 },
  { code: "USD", name: "US Dollar", symbol: "$", minorUnitScale: 2 },
  { code: "EUR", name: "Euro", symbol: "€", minorUnitScale: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", minorUnitScale: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", minorUnitScale: 0 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", minorUnitScale: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", minorUnitScale: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", minorUnitScale: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", minorUnitScale: 2 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", minorUnitScale: 2 },
];

export function isSupportedCurrencyCode(code: string): boolean {
  return CURRENCY_CATALOG.some((currency) => currency.code === code);
}

export function findCurrencyDefinition(code: string): CurrencyDefinition | undefined {
  return CURRENCY_CATALOG.find((currency) => currency.code === code);
}
