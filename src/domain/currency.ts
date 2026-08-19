// MVP-only currency support (ADR-020, rule #7). Isolated to this one file
// so multi-currency support has a single deletion point later.
export const MVP_CURRENCY_CODE = "INR";

export function isSupportedCurrencyCode(code: string): boolean {
  return code === MVP_CURRENCY_CODE;
}
