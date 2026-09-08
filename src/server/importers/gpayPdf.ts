import { toMinorUnits, type AccountType, type ImportDirection, type NormalizedImportRow } from "@/core";
import { UnrecognizedImportFormatError } from "../services/errors";
import { MONTHS, parseAmount } from "./shared";
import { readItems, mergeAnchors, buildLines } from "./pdfTextExtraction";
import type { ImportAdapter, ParsedFile } from "./types";

// GPay itself is not an Account — every row instead tags the real bank/
// card the payment moved through ("Paid by Federal Bank 1220", "Paid to
// Axis Bank 5245", "Paid by UPI Lite | Axis Bank 5245"). Unlike every
// other adapter here, this file has no single owning source account of
// its own (`ParsedFile.accountIdentifier` is always null, same as generic
// CSV's "unidentified" case) — Stone 1's `NormalizedImportRow.
// accountIdentifier` carries each row's own identity instead, resolved
// per row by `buildPreviewFromRows` (services/imports.ts).
const PDF_MAGIC = "%PDF-";
const GOOGLE_PAY_MARKER = /google pay/i;
const UPI_REFERENCE_LINE = /^UPI Transaction ID:\s*(\S+)$/i;
const ACCOUNT_LINE = /^Paid (by|to) (.+)$/i;
const DATE_LINE = /^(\d{1,2})\s+([A-Za-z]{3}),?\s*(\d{4})$/;
const TIME_LINE = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
// The description line is always one of exactly these shapes — the part
// after the verb phrase is the counterparty, when there genuinely is one
// ("Top-up to UPI Lite" has none; it's the user funding their own
// wallet, not a payment to another party — no match here on purpose,
// `counterparty` stays unset for it).
const COUNTERPARTY_LINE = /^(?:Paid to|Received from|Self transfer to)\s+(.+)$/i;

// "01 Aug, 2026" -> "2026-08-01".
function toIsoDate(match: RegExpMatchArray): string {
  const [, dd, mon, yyyy] = match;
  const mm = MONTHS[mon.toLowerCase()];
  return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
}

// "09:15 AM" -> "09:15", "06:30 PM" -> "18:30".
function to24Hour(match: RegExpMatchArray): string {
  const [, hh, mm, ampm] = match;
  let hour = Number.parseInt(hh, 10) % 12;
  if (ampm.toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${mm}`;
}

const CREDIT_CARD_MARKER = /credit card/i;

interface AccountProposal {
  identifier: string;
  proposedName: string;
  proposedAccountType: AccountType;
  proposedAccountClassification: "ASSET" | "LIABILITY";
}

// The account line's trailing digit run is the real bank/card suffix
// regardless of which side of a "|" it falls on — GPay's own template
// puts the payment-instrument qualifier ("RuPay credit card") *after* the
// bank ("Federal Bank XX97 | RuPay credit card") but the wallet-tier
// qualifier ("UPI Lite") *before* it ("UPI Lite | Axis Bank 5245").
// Chasing that ordering is unnecessary for the digits — they only ever
// belong to the underlying bank/card either way. A masked credit-card
// suffix ("XX97", 2 real digits) won't exact-match a bank-statement-
// derived `AccountIdentifier` (those are always 4-digit `last4` variants,
// `core/ledger/accounts/accountIdentifier.ts`'s `deriveIdentifierVariants`)
// — this is exactly the case `proposedAccountType` below exists for: a
// row whose identifier will never resolve to an existing Account still
// needs to become a *correctly typed* new-Account proposal (Liability/
// CREDIT_CARD, not Asset/BANK) rather than silently falling back to
// whatever account the rest of the file resolved to (the real bug this
// delta fixes — a credit-card-routed GPay row was never surfacing as its
// own "new Account" card at all). UPI Lite is treated as its underlying
// bank account (it's GPay's own quasi-wallet, funded by and settled
// through that account, not a real Ledger Account of its own).
function parseAccountProposal(accountText: string): AccountProposal | undefined {
  const digitRuns = accountText.match(/\d+/g);
  const identifier = digitRuns?.[digitRuns.length - 1];
  if (!identifier) return undefined;

  // Institution name is everything before the (optionally X-masked)
  // digit run — "Federal Bank XX97 | RuPay credit card" -> "Federal
  // Bank"; "Axis Bank 5245" -> "Axis Bank"; "UPI Lite | Axis Bank 5245"
  // -> "UPI Lite | Axis Bank" (the "UPI Lite | " prefix is cosmetic here,
  // left in rather than special-cased again — it still reads fine as an
  // account name, and this path is rare in practice since UPI Lite rows
  // usually resolve via the underlying bank's own identifier already).
  const institution = accountText.split(/\s+[Xx]*\d+/)[0]?.trim() || accountText;
  const isCreditCard = CREDIT_CARD_MARKER.test(accountText);

  return {
    identifier,
    proposedName: `${institution} ••${identifier}`,
    proposedAccountType: isCreditCard ? "CREDIT_CARD" : "BANK",
    proposedAccountClassification: isCreditCard ? "LIABILITY" : "ASSET",
  };
}

interface PendingRow {
  date: string;
  time: string | null;
  description: string | null;
  amountRaw: string | null;
  reference: string | null;
  direction: ImportDirection | null;
  accountText: string | null;
}

export const gpayPdfAdapter: ImportAdapter = {
  id: "gpay.transactions.pdf",
  label: "Google Pay Transactions (PDF)",
  institutionLabel: "Google Pay",
  detect(filename: string, buffer: Buffer): boolean {
    if (!/\.pdf$/i.test(filename)) return false;
    return buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC;
  },
  async parse(buffer: Buffer, minorUnitScale: number): Promise<ParsedFile> {
    const items = await readItems(buffer, undefined);

    if (!items.some((item) => GOOGLE_PAY_MARKER.test(item.str))) {
      throw new UnrecognizedImportFormatError("expected a Google Pay transaction statement");
    }
    if (!items.some((item) => UPI_REFERENCE_LINE.test(item.str.trim()))) {
      throw new UnrecognizedImportFormatError("expected at least one UPI Transaction ID line");
    }

    const marker = items.find((item) => item.str.trim() === "Transaction details");
    if (!marker) {
      throw new UnrecognizedImportFormatError(`expected a "Transaction details" column header`);
    }
    const headerBand = items.filter((item) => item.page === marker.page && Math.abs(item.y - marker.y) < 15);
    const anchors = mergeAnchors(headerBand.map((item) => item.x));
    const lines = buildLines(items, anchors);

    const rows: NormalizedImportRow[] = [];
    let pending: PendingRow | null = null;

    const finalize = () => {
      if (!pending) return;
      if (pending.description && pending.amountRaw && pending.direction) {
        const amount = parseAmount(pending.amountRaw.replace(/^[^\d]*/, ""));
        if (amount > 0) {
          const proposal = pending.accountText ? parseAccountProposal(pending.accountText) : undefined;
          rows.push({
            date: pending.date,
            time: pending.time ?? undefined,
            description: pending.description,
            amountMinor: toMinorUnits(amount, minorUnitScale),
            direction: pending.direction,
            reference: pending.reference ?? undefined,
            accountIdentifier: proposal?.identifier,
            proposedAccountName: proposal?.proposedName,
            proposedAccountType: proposal?.proposedAccountType,
            proposedAccountClassification: proposal?.proposedAccountClassification,
            counterparty: COUNTERPARTY_LINE.exec(pending.description)?.[1]?.trim(),
          });
        }
      }
      pending = null;
    };

    for (const line of lines) {
      const dateCell = (line.columns[0] ?? "").trim();
      const detailsCell = (line.columns[1] ?? "").trim();
      const amountCell = (line.columns[2] ?? "").trim();

      const dateMatch = DATE_LINE.exec(dateCell);
      if (dateMatch) {
        finalize();
        pending = { date: toIsoDate(dateMatch), time: null, description: null, amountRaw: null, reference: null, direction: null, accountText: null };
        // Date, description, and amount all share one physical line (same
        // y-band) — the date column starting a new row doesn't mean this
        // line has nothing else on it.
        if (amountCell) {
          pending.description = detailsCell;
          pending.amountRaw = amountCell;
        }
        continue;
      }
      if (!pending) continue;

      // The date column also carries the row's own time ("09:15 AM") on
      // its own physical line, whose *details* column still holds real
      // content (the "UPI Transaction ID:" reference) — capture it, but
      // never skip the rest of this line just because its date column
      // isn't itself a date.
      const timeMatch = TIME_LINE.exec(dateCell);
      if (timeMatch) pending.time = to24Hour(timeMatch);

      // Every page repeats its own preamble (title, phone/email, the
      // "Date & time / Transaction details / Amount" column header) —
      // some of it, at x-positions far from every real column anchor,
      // gets nearest-anchor-bucketed straight into the Amount column
      // (e.g. "Transaction statement" itself). Once a row already has
      // every field a real row has, it's done — ignore anything further
      // until the next date line finalizes it, rather than trying to
      // enumerate every possible stray preamble string. A real bug,
      // caught against the real sample statement this fixture models
      // (not the single-page-only version of this fixture, which never
      // exercised a second page's own repeated preamble at all).
      if (pending.description && pending.amountRaw && pending.direction) continue;

      if (amountCell) {
        // The description + amount always share one physical line (same
        // y-band) — this is that line, regardless of what the details
        // text itself says (it can start with "Paid to " too, e.g. "Paid
        // to Sanika Konde" — the *account* line below is distinguished by
        // having an empty amount column, not by its own wording).
        pending.description = detailsCell;
        pending.amountRaw = amountCell;
        continue;
      }

      const refMatch = UPI_REFERENCE_LINE.exec(detailsCell);
      if (refMatch) {
        pending.reference = refMatch[1];
        continue;
      }

      const accountMatch = ACCOUNT_LINE.exec(detailsCell);
      if (accountMatch) {
        pending.direction = accountMatch[1].toLowerCase() === "by" ? "debit" : "credit";
        pending.accountText = accountMatch[2];
      }
    }
    finalize();

    // No single owning source account (see this file's own header
    // comment) — every row carries its own instead.
    return { rows, accountIdentifier: null };
  },
};
