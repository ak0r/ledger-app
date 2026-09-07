import * as XLSX from "xlsx";

// Header aliases accepted case-insensitively by genericCsv.ts and, for
// suggesting a default mapping, Custom Importer's own `suggestColumnMapping`
// (customImportMapping.ts) — hoisted here so the latter has no reason to
// import a specific adapter module. Real bank exports vary on naming; this
// covers the common ones without trying to be exhaustive.
export const DATE_COLUMNS = ["date"];
export const DESCRIPTION_COLUMNS = ["description", "narration"];
export const DEBIT_COLUMNS = ["debit"];
export const CREDIT_COLUMNS = ["credit"];
export const AMOUNT_COLUMNS = ["amount"];
export const DIRECTION_COLUMNS = ["type", "direction"];
export const REFERENCE_COLUMNS = ["reference", "ref"];

export function findColumn(headers: readonly string[], candidates: readonly string[]): string | undefined {
  return headers.find((header) => candidates.includes(header.trim().toLowerCase()));
}

// Byte-identical across every XLS adapter (HDFC/Axis/IDFC FIRST) — no bank
// knowledge here, just reading a workbook's first sheet into raw string rows.
export function readXlsRows(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
}

// Preamble length varies with customer name/address length across
// statements — scan for the known header cells rather than assume a fixed
// row index. `required` (the actual header text) stays adapter-owned.
export function findHeaderRowIndex(rows: string[][], required: readonly string[]): number {
  return rows.findIndex((row) => {
    const cells = row.map((cell) => cell.trim().toLowerCase());
    return required.every((header) => cells.includes(header));
  });
}

// Strip thousands separators, coerce to a non-negative magnitude — every
// adapter treats a blank/unparsable cell as "no amount here" (0), never an
// error, since a row legitimately has only one of debit/credit populated.
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.abs(value) : 0;
}

// Shared by every adapter using a "dd-Mon-yyyy"-shaped date (IDFC FIRST,
// Federal Bank PDF) — was duplicated verbatim in both before extraction.
export const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};
