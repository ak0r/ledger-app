import { toMinorUnits, type ImportDirection, type NormalizedImportRow } from "@/core";
import { UnsupportedImportFormatError } from "../services/errors";
import { findHeaderRowIndex, parseAmount, readXlsRows } from "./shared";
import type { ImportAdapter, ParsedFile } from "./types";

const NARRATION_HEADER = "narration";
const WITHDRAWAL_HEADER = "withdrawal amt.";
const DATE_ROW_PATTERN = /^\d{2}\/\d{2}\/\d{2}$/;
const ACCOUNT_NO_PATTERN = /Account No\s*:\s*(\d+)/i;
const INSTITUTION_MARKER = /HDFC BANK/i;

function findAccountIdentifier(rows: string[][]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      const match = ACCOUNT_NO_PATTERN.exec(cell);
      if (match) return match[1];
    }
  }
  return null;
}

// "05/04/26" -> "2026-04-05". HDFC statements only ever show 2-digit years
// for recent transactions — no pre-2000 century-cutoff logic needed.
function toIsoDate(ddmmyy: string): string {
  const [dd, mm, yy] = ddmmyy.split("/");
  return `20${yy}-${mm}-${dd}`;
}

function isHdfcWorkbook(rows: string[][]): boolean {
  return rows.slice(0, 5).some((row) => row.some((cell) => INSTITUTION_MARKER.test(cell)));
}

export const hdfcAccountXlsAdapter: ImportAdapter = {
  id: "hdfc.account.xls",
  label: "HDFC Bank Account (XLS)",
  institutionLabel: "HDFC Bank",
  detect(filename: string, buffer: Buffer): boolean {
    if (!/\.xlsx?$/i.test(filename)) return false;
    try {
      return isHdfcWorkbook(readXlsRows(buffer));
    } catch {
      return false;
    }
  },
  async parse(buffer: Buffer, minorUnitScale: number): Promise<ParsedFile> {
    const rows = readXlsRows(buffer);
    const headerIndex = findHeaderRowIndex(rows, [NARRATION_HEADER, WITHDRAWAL_HEADER]);
    if (headerIndex === -1) {
      throw new UnsupportedImportFormatError(
        `expected an HDFC account statement with a "Narration"/"Withdrawal Amt." header row`,
      );
    }

    const accountIdentifier = findAccountIdentifier(rows);

    const normalized: NormalizedImportRow[] = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const dateCell = (row[0] ?? "").trim();
      // Skips the "********" separator row right after the header and the
      // blank/summary rows at the end — every non-transaction row in this
      // layout fails the date pattern, so this alone is enough to isolate
      // the real transaction rows without a fixed end boundary.
      if (!DATE_ROW_PATTERN.test(dateCell)) continue;

      const description = (row[1] ?? "").trim();
      const reference = (row[2] ?? "").trim();
      const withdrawal = parseAmount(row[4] ?? "");
      const credit = parseAmount(row[5] ?? "");

      let direction: ImportDirection | undefined;
      let amount = 0;
      if (withdrawal > 0) {
        direction = "debit";
        amount = withdrawal;
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
        reference: reference || undefined,
      });
    }

    return { rows: normalized, accountIdentifier };
  },
};
