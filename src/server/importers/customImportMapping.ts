import {
  toMinorUnits,
  type ColumnMapping,
  type DateFormat,
  type ImportDirection,
  type NormalizedImportRow,
  type RawTable,
} from "@/core";
import {
  AMOUNT_COLUMNS,
  CREDIT_COLUMNS,
  DATE_COLUMNS,
  DEBIT_COLUMNS,
  DESCRIPTION_COLUMNS,
  DIRECTION_COLUMNS,
  MONTHS,
  REFERENCE_COLUMNS,
  parseAmount,
} from "./shared";

// Ledger Custom Importer delta — the shared "apply a column mapping to a
// raw table" step both the XLS and PDF-crop Custom Importer paths feed
// into (services/imports.ts's `previewCustomXlsImport`/
// `previewCustomPdfImport`). Generalizes genericCsv.ts's own row-building
// loop (same debit/credit-vs-amount/direction duality, same shared
// `parseAmount`) — indexed by column number instead of alias lookup, since
// a Custom Importer table's header text (if any) already failed to match
// any known alias, or may not exist at all (a cropped PDF region).

function parseDirection(raw: string): ImportDirection | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "debit" || normalized === "dr") return "debit";
  if (normalized === "credit" || normalized === "cr") return "credit";
  return undefined;
}

// "31/01/2026" (DMY) or "01/31/2026" (MDY) or "04-Apr-2026" (DD_MON_YYYY)
// or already-ISO -> "2026-01-31". Returns null for anything that doesn't
// match the claimed format, rather than guessing — the caller treats a
// null date the same as a blank one (skip the row).
function toIsoDate(raw: string, format: DateFormat): string | null {
  const value = raw.trim();
  if (format === "ISO") {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }
  if (format === "DD_MON_YYYY") {
    const match = /^(\d{1,2})[- ]([A-Za-z]{3,})[- ](\d{4})$/.exec(value);
    if (!match) return null;
    const month = MONTHS[match[2]!.toLowerCase().slice(0, 3)];
    if (!month) return null;
    return `${match[3]}-${month}-${match[1]!.padStart(2, "0")}`;
  }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, first, second, year] = match;
  const [month, day] = format === "DMY_SLASH" ? [second, first] : [first, second];
  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

// Pre-fills a default mapping from a raw table's own header row (when one
// exists) by reusing genericCsv.ts's own alias tables — so the
// ColumnMappingForm opens pre-filled instead of blank whenever the header
// text happens to be close to (but not exactly) a recognized alias, or a
// column order genericCsv.ts's own fixed logic didn't anticipate. Returns
// a partial mapping; the UI/caller fills in whatever this can't determine
// (dateFormat has no reliable auto-detection from header text alone).
export function suggestColumnMapping(table: RawTable): Partial<ColumnMapping> {
  if (table.headerRowIndex === null) return {};
  const headers = table.rows[table.headerRowIndex] ?? [];

  const indexOf = (candidates: readonly string[]): number | undefined => {
    const index = headers.findIndex((header) => candidates.includes(header.trim().toLowerCase()));
    return index === -1 ? undefined : index;
  };

  const dateColumn = indexOf(DATE_COLUMNS);
  const descriptionColumn = indexOf(DESCRIPTION_COLUMNS);
  const debitColumn = indexOf(DEBIT_COLUMNS);
  const creditColumn = indexOf(CREDIT_COLUMNS);
  const amountColumn = indexOf(AMOUNT_COLUMNS);
  const directionColumn = indexOf(DIRECTION_COLUMNS);
  const referenceColumn = indexOf(REFERENCE_COLUMNS);

  const suggestion: Partial<ColumnMapping> = {};
  if (dateColumn !== undefined) suggestion.dateColumn = dateColumn;
  if (descriptionColumn !== undefined) suggestion.descriptionColumn = descriptionColumn;
  if (referenceColumn !== undefined) suggestion.referenceColumn = referenceColumn;
  if (debitColumn !== undefined && creditColumn !== undefined) {
    suggestion.amountShape = { kind: "debitCredit", debitColumn, creditColumn };
  } else if (amountColumn !== undefined && directionColumn !== undefined) {
    suggestion.amountShape = { kind: "amountDirection", amountColumn, directionColumn };
  }
  return suggestion;
}

export function buildRowsFromMapping(
  table: RawTable,
  mapping: ColumnMapping,
  minorUnitScale: number,
): NormalizedImportRow[] {
  const rows: NormalizedImportRow[] = [];
  for (let i = 0; i < table.rows.length; i++) {
    if (i === table.headerRowIndex) continue;
    const row = table.rows[i]!;

    const date = toIsoDate(row[mapping.dateColumn] ?? "", mapping.dateFormat);
    const description = row[mapping.descriptionColumn]?.trim();
    if (!date || !description) continue;

    let direction: ImportDirection | undefined;
    let amount = 0;
    if (mapping.amountShape.kind === "debitCredit") {
      const debit = parseAmount(row[mapping.amountShape.debitColumn] ?? "");
      const credit = parseAmount(row[mapping.amountShape.creditColumn] ?? "");
      if (debit > 0) {
        direction = "debit";
        amount = debit;
      } else if (credit > 0) {
        direction = "credit";
        amount = credit;
      }
    } else {
      direction = parseDirection(row[mapping.amountShape.directionColumn] ?? "");
      amount = parseAmount(row[mapping.amountShape.amountColumn] ?? "");
    }
    if (!direction || amount <= 0) continue;

    rows.push({
      date,
      description,
      amountMinor: toMinorUnits(amount, minorUnitScale),
      direction,
      reference: mapping.referenceColumn !== null ? row[mapping.referenceColumn]?.trim() || undefined : undefined,
    });
  }
  return rows;
}
