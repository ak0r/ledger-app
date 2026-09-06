import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { fromMinorUnits } from "@/core"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Presentation only — never used for anything domain/calculation-related.
export function formatMoney(amountMinorUnits: number, symbol: string, scale: number): string {
  const amount = fromMinorUnits(amountMinorUnits, scale);
  return `${symbol}${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(amount)}`;
}

const MONTH_ABBREVIATIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// Presentation only — "01 Jul 2026" instead of the raw "YYYY-MM-DD" storage
// format (never used for anything domain/editing-related: forms keep
// reading the untouched ISO string, e.g. `TransactionTableRow.date`, so a
// native `<input type="date">` still gets the format it requires). Plain
// string manipulation, not `Date`/`Intl.DateTimeFormat` — `new
// Date("2026-07-01")` parses as UTC midnight, so formatting it in a
// timezone behind UTC would print the wrong (previous) day. Dates are
// "YYYY-MM-DD" strings end to end specifically to sidestep that, so display
// formatting stays string-only too.
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  const monthName = MONTH_ABBREVIATIONS[Number(month) - 1] ?? month;
  return `${day} ${monthName} ${year}`;
}

// Presentation only — turns a frozen domain enum value (e.g. "CREDIT_CARD")
// into a human-readable label ("Credit Card"). Never used for anything
// domain/validation-related; the enum values themselves are what's
// persisted and validated against (docs/08-ui-principles.md "hide
// accounting complexity" — users shouldn't see SHOUTING_CASE vocabulary).
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
