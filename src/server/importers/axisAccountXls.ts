import { toMinorUnits, type ImportDirection, type NormalizedImportRow } from "@/core";
import { UnsupportedImportFormatError } from "../services/errors";
import { findHeaderRowIndex, parseAmount, readXlsRows } from "./shared";
import type { ImportAdapter, ParsedFile } from "./types";

const PARTICULARS_HEADER = "particulars";
const TRAN_DATE_HEADER = "tran date";
const DATE_ROW_PATTERN = /^\d{2}-\d{2}-\d{4}$/;
const ACCOUNT_NO_PATTERN = /Axis Account No\s*-\s*(\d+)/i;
// "UPI/P2A/645701741525/POONAM AM/INDB/UPI/" -> "645701741525" — the UPI
// transaction ID (UTR), verified against a real statement to appear on
// every UPI-routed row in exactly this position (the 3rd "/"-separated
// PARTICULARS segment, right after "UPI/P2A" or "UPI/P2M"). Cross-source
// reconciliation (GPay importer delta) depends on this: it's the same ID
// a UPI app's own transaction history shows for the same payment, so an
// exact match is a near-certain duplicate signal — CHQNO (this adapter's
// only prior `reference` source) is always blank for a UPI row.
const UPI_UTR_PATTERN = /^UPI\/P2[AM]\/(\d+)\//;
// "UPI/P2A/645701741525/POONAM AM/INDB/UPI/" -> "POONAM AM" — the 4th
// "/"-separated segment is the counterparty/merchant name on every
// UPI-shaped row (verified against a real statement across both P2A
// person-to-person and P2M merchant payments). Only meaningful for that
// shape; non-UPI PARTICULARS (NEFT/IMPS/MOB SELFFT/interest/charges) get
// no `counterparty` at all rather than a guess — cross-source
// reconciliation (`lib/duplicate-detection.ts`) only ever compares this
// field when both sides have one.
const UPI_COUNTERPARTY_PATTERN = /^UPI\/P2[AM]\/\d+\/([^/]+)\//;
// Deliberately more specific than a bare "AXIS BANK" scan (row-level
// PARTICULARS text can legitimately mention "AXIS BANK" for a transfer
// to/from an Axis account on a *different* institution's statement) — this
// exact preamble phrase only appears on an Axis-issued statement itself.
const INSTITUTION_MARKER = /Statement of Axis Account No/i;

function findAccountIdentifier(rows: string[][]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      const match = ACCOUNT_NO_PATTERN.exec(cell);
      if (match) return match[1];
    }
  }
  return null;
}

// "21-08-2026" -> "2026-08-21". Axis statements use a 4-digit year
// (dd-mm-yyyy), unlike HDFC's 2-digit dd/mm/yy — no shared date parser
// between the two adapters.
function toIsoDate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

function isAxisWorkbook(rows: string[][]): boolean {
  return rows.slice(0, 20).some((row) => row.some((cell) => INSTITUTION_MARKER.test(cell)));
}

export const axisAccountXlsAdapter: ImportAdapter = {
  id: "axis.account.xls",
  label: "Axis Bank Account (XLS)",
  institutionLabel: "Axis Bank",
  detect(filename: string, buffer: Buffer): boolean {
    if (!/\.xlsx?$/i.test(filename)) return false;
    try {
      return isAxisWorkbook(readXlsRows(buffer));
    } catch {
      return false;
    }
  },
  async parse(buffer: Buffer, minorUnitScale: number): Promise<ParsedFile> {
    const rows = readXlsRows(buffer);
    const headerIndex = findHeaderRowIndex(rows, [PARTICULARS_HEADER, TRAN_DATE_HEADER]);
    if (headerIndex === -1) {
      throw new UnsupportedImportFormatError(
        `expected an Axis account statement with a "Tran Date"/"Particulars" header row`,
      );
    }

    const accountIdentifier = findAccountIdentifier(rows);

    const normalized: NormalizedImportRow[] = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      // Column order: SRL NO, Tran Date, CHQNO, PARTICULARS, DR, CR, BAL, SOL.
      const dateCell = (row[1] ?? "").trim();
      // Skips the blank row and the closing legal/glossary text after the
      // last transaction — every non-transaction row in this layout fails
      // the date pattern, same isolation strategy as the HDFC adapter.
      if (!DATE_ROW_PATTERN.test(dateCell)) continue;

      const chequeNo = (row[2] ?? "").trim();
      const description = (row[3] ?? "").trim();
      const debit = parseAmount(row[4] ?? "");
      const credit = parseAmount(row[5] ?? "");

      let direction: ImportDirection | undefined;
      let amount = 0;
      if (debit > 0) {
        direction = "debit";
        amount = debit;
      } else if (credit > 0) {
        direction = "credit";
        amount = credit;
      }
      if (!direction) continue;

      const utr = UPI_UTR_PATTERN.exec(description)?.[1];
      const counterparty = UPI_COUNTERPARTY_PATTERN.exec(description)?.[1]?.trim();

      normalized.push({
        date: toIsoDate(dateCell),
        description,
        amountMinor: toMinorUnits(amount, minorUnitScale),
        direction,
        reference: utr ?? (chequeNo || undefined),
        counterparty: counterparty || undefined,
      });
    }

    return { rows: normalized, accountIdentifier };
  },
};
