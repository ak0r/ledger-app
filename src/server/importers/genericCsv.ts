import Papa from "papaparse";
import { toMinorUnits, type ImportDirection, type NormalizedImportRow } from "@/core";
import { UnsupportedImportFormatError } from "../services/errors";
import { parseAmount } from "./shared";
import type { ImportAdapter, ParsedFile } from "./types";

// Header aliases accepted case-insensitively (delta §5 — "Generic CSV ->
// Column mapping / parsing"). Real bank exports vary on naming; this covers
// the common ones without trying to be exhaustive.
const DATE_COLUMNS = ["date"];
const DESCRIPTION_COLUMNS = ["description", "narration"];
const DEBIT_COLUMNS = ["debit"];
const CREDIT_COLUMNS = ["credit"];
const AMOUNT_COLUMNS = ["amount"];
const DIRECTION_COLUMNS = ["type", "direction"];
const REFERENCE_COLUMNS = ["reference", "ref"];

function findColumn(headers: readonly string[], candidates: readonly string[]): string | undefined {
  return headers.find((header) => candidates.includes(header.trim().toLowerCase()));
}

function parseDirection(raw: string): ImportDirection | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "debit" || normalized === "dr") return "debit";
  if (normalized === "credit" || normalized === "cr") return "credit";
  return undefined;
}

// Registered last (index.ts) and always `detect()`s true — the explicit
// no-institution-detected fallback (delta §8: "an appropriate fallback such
// as generic parsing/manual source selection").
export const genericCsvAdapter: ImportAdapter = {
  id: "generic.any.csv",
  label: "Generic CSV",
  institutionLabel: "Account",
  detect(): boolean {
    return true;
  },
  async parse(buffer: Buffer, minorUnitScale: number): Promise<ParsedFile> {
    const fileText = buffer.toString("utf8");
    const result = Papa.parse<Record<string, string>>(fileText, {
      header: true,
      skipEmptyLines: true,
    });

    const headers = result.meta.fields ?? [];
    const dateColumn = findColumn(headers, DATE_COLUMNS);
    const descriptionColumn = findColumn(headers, DESCRIPTION_COLUMNS);
    if (!dateColumn || !descriptionColumn) {
      throw new UnsupportedImportFormatError(
        `expected a "date" column and a "description"/"narration" column`,
      );
    }

    const debitColumn = findColumn(headers, DEBIT_COLUMNS);
    const creditColumn = findColumn(headers, CREDIT_COLUMNS);
    const amountColumn = findColumn(headers, AMOUNT_COLUMNS);
    const directionColumn = findColumn(headers, DIRECTION_COLUMNS);
    const referenceColumn = findColumn(headers, REFERENCE_COLUMNS);

    const useDebitCredit = Boolean(debitColumn && creditColumn);
    const useAmountDirection = Boolean(amountColumn && directionColumn);
    if (!useDebitCredit && !useAmountDirection) {
      throw new UnsupportedImportFormatError(
        `expected either "debit"/"credit" columns or "amount"/"type" columns`,
      );
    }

    const rows: NormalizedImportRow[] = [];
    for (const record of result.data) {
      const date = record[dateColumn]?.trim();
      const description = record[descriptionColumn]?.trim();
      if (!date || !description) continue;

      let direction: ImportDirection | undefined;
      let amount = 0;

      if (useDebitCredit) {
        const debit = parseAmount(record[debitColumn!] ?? "");
        const credit = parseAmount(record[creditColumn!] ?? "");
        if (debit > 0) {
          direction = "debit";
          amount = debit;
        } else if (credit > 0) {
          direction = "credit";
          amount = credit;
        }
      } else {
        direction = parseDirection(record[directionColumn!] ?? "");
        amount = parseAmount(record[amountColumn!] ?? "");
      }

      if (!direction || amount <= 0) continue;

      rows.push({
        date,
        description,
        amountMinor: toMinorUnits(amount, minorUnitScale),
        direction,
        reference: referenceColumn ? record[referenceColumn]?.trim() || undefined : undefined,
      });
    }

    return { rows, accountIdentifier: null };
  },
};
