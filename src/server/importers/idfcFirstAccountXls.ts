import { toMinorUnits, type ImportDirection, type NormalizedImportRow } from "@/core";
import { UnsupportedImportFormatError } from "../services/errors";
import { findHeaderRowIndex, MONTHS, parseAmount, readXlsRows } from "./shared";
import type { ImportAdapter, ParsedFile } from "./types";

const TRANSACTION_DATE_HEADER = "transaction date";
const PARTICULARS_HEADER = "particulars";
const ACCOUNT_NUMBER_LABEL = "account number";
const DATE_ROW_PATTERN = /^\d{2}-[A-Za-z]{3}-\d{4}$/;
// IDFB is the IFSC prefix uniquely assigned to IDFC FIRST Bank — more
// reliable than scanning for the literal bank name, which never appears in
// this statement's own preamble text (only inside a support email address
// on the second worksheet).
const INSTITUTION_MARKER = /^IDFB\d+$/i;

// Unlike HDFC/Axis (account number embedded in a sentence, extracted by
// regex), IDFC FIRST's preamble is a plain label/value grid — "ACCOUNT
// NUMBER" and its value sit in adjacent cells of the same row.
function findAccountIdentifier(rows: string[][]): string | null {
  for (const row of rows) {
    const labelIndex = row.findIndex((cell) => cell.trim().toLowerCase() === ACCOUNT_NUMBER_LABEL);
    if (labelIndex !== -1) {
      const value = (row[labelIndex + 1] ?? "").trim();
      if (value) return value;
    }
  }
  return null;
}

// "07-Apr-2026" -> "2026-04-07". IDFC FIRST statements use a
// dd-Mon-yyyy format — a third distinct date shape alongside HDFC's
// dd/mm/yy and Axis's dd-mm-yyyy, no shared date parser across adapters.
function toIsoDate(ddMonYyyy: string): string {
  const [dd, mon, yyyy] = ddMonYyyy.split("-");
  const mm = MONTHS[mon.toLowerCase()];
  return `${yyyy}-${mm}-${dd}`;
}

function isIdfcFirstWorkbook(rows: string[][]): boolean {
  return rows.slice(0, 15).some((row) => row.some((cell) => INSTITUTION_MARKER.test(cell.trim())));
}

export const idfcFirstAccountXlsAdapter: ImportAdapter = {
  id: "idfc-first.account.xls",
  label: "IDFC FIRST Bank Account (XLS)",
  institutionLabel: "IDFC FIRST Bank",
  detect(filename: string, buffer: Buffer): boolean {
    if (!/\.xlsx?$/i.test(filename)) return false;
    try {
      return isIdfcFirstWorkbook(readXlsRows(buffer));
    } catch {
      return false;
    }
  },
  async parse(buffer: Buffer, minorUnitScale: number): Promise<ParsedFile> {
    const rows = readXlsRows(buffer);
    const headerIndex = findHeaderRowIndex(rows, [TRANSACTION_DATE_HEADER, PARTICULARS_HEADER]);
    if (headerIndex === -1) {
      throw new UnsupportedImportFormatError(
        `expected an IDFC FIRST Bank account statement with a "Transaction Date"/"Particulars" header row`,
      );
    }

    const accountIdentifier = findAccountIdentifier(rows);

    const normalized: NormalizedImportRow[] = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      // Column order: Transaction Date, Value Date, Particulars, Cheque No.,
      // Debit, Credit, Balance.
      const dateCell = (row[0] ?? "").trim();
      // Skips the blank rows and the trailing Total/count/"End of the
      // Statement" rows — every non-transaction row in this layout fails
      // the date pattern, same isolation strategy as the other adapters.
      if (!DATE_ROW_PATTERN.test(dateCell)) continue;

      const chequeNo = (row[3] ?? "").trim();
      const description = (row[2] ?? "").trim();
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

      normalized.push({
        date: toIsoDate(dateCell),
        description,
        amountMinor: toMinorUnits(amount, minorUnitScale),
        direction,
        reference: chequeNo || undefined,
      });
    }

    return { rows: normalized, accountIdentifier };
  },
};
