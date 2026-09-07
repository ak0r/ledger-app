import { describe, expect, it } from "vitest";
import type { ColumnMapping, RawTable } from "@/core";
import { buildRowsFromMapping, suggestColumnMapping } from "./customImportMapping";

describe("buildRowsFromMapping", () => {
  const table: RawTable = {
    headerRowIndex: 0,
    rows: [
      ["Date", "Description", "Debit", "Credit", "Ref"],
      ["2026-08-01", "Coffee", "150", "", "T1"],
      ["2026-08-02", "Salary", "", "50000", "T2"],
      ["2026-08-03", "Blank amount", "", "", "T3"],
    ],
  };

  it("builds rows from a debit/credit shape, skipping a row with no amount", () => {
    const mapping: ColumnMapping = {
      dateColumn: 0,
      dateFormat: "ISO",
      descriptionColumn: 1,
      amountShape: { kind: "debitCredit", debitColumn: 2, creditColumn: 3 },
      referenceColumn: 4,
    };

    const rows = buildRowsFromMapping(table, mapping, 2);

    expect(rows).toEqual([
      { date: "2026-08-01", description: "Coffee", amountMinor: 15000, direction: "debit", reference: "T1" },
      { date: "2026-08-02", description: "Salary", amountMinor: 5000000, direction: "credit", reference: "T2" },
    ]);
  });

  it("builds rows from an amount/direction shape", () => {
    const adTable: RawTable = {
      headerRowIndex: 0,
      rows: [
        ["Date", "Description", "Amount", "Type"],
        ["2026-08-01", "Coffee", "150", "debit"],
        ["2026-08-02", "Salary", "50000", "credit"],
      ],
    };
    const mapping: ColumnMapping = {
      dateColumn: 0,
      dateFormat: "ISO",
      descriptionColumn: 1,
      amountShape: { kind: "amountDirection", amountColumn: 2, directionColumn: 3 },
      referenceColumn: null,
    };

    const rows = buildRowsFromMapping(adTable, mapping, 2);

    expect(rows).toEqual([
      { date: "2026-08-01", description: "Coffee", amountMinor: 15000, direction: "debit", reference: undefined },
      { date: "2026-08-02", description: "Salary", amountMinor: 5000000, direction: "credit", reference: undefined },
    ]);
  });

  it.each([
    ["DMY_SLASH", "31/01/2026", "2026-01-31"],
    ["MDY_SLASH", "01/31/2026", "2026-01-31"],
    ["DD_MON_YYYY", "04-Apr-2026", "2026-04-04"],
    ["ISO", "2026-04-04", "2026-04-04"],
  ] as const)("converts a %s date to ISO", (dateFormat, raw, expectedIso) => {
    const dateTable: RawTable = {
      headerRowIndex: null,
      rows: [[raw, "Test", "100", ""]],
    };
    const mapping: ColumnMapping = {
      dateColumn: 0,
      dateFormat,
      descriptionColumn: 1,
      amountShape: { kind: "debitCredit", debitColumn: 2, creditColumn: 3 },
      referenceColumn: null,
    };

    const rows = buildRowsFromMapping(dateTable, mapping, 2);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe(expectedIso);
  });

  it("skips a row whose date doesn't match the claimed format", () => {
    const mapping: ColumnMapping = {
      dateColumn: 0,
      dateFormat: "ISO",
      descriptionColumn: 1,
      amountShape: { kind: "debitCredit", debitColumn: 2, creditColumn: 3 },
      referenceColumn: null,
    };
    const badTable: RawTable = { headerRowIndex: null, rows: [["not-a-date", "x", "100", ""]] };

    expect(buildRowsFromMapping(badTable, mapping, 2)).toEqual([]);
  });
});

describe("suggestColumnMapping", () => {
  it("returns an empty suggestion when there's no header row", () => {
    expect(suggestColumnMapping({ headerRowIndex: null, rows: [["a", "b"]] })).toEqual({});
  });

  it("suggests a debit/credit mapping from alias-matching headers", () => {
    const table: RawTable = { headerRowIndex: 0, rows: [["Date", "Narration", "Debit", "Credit", "Reference"]] };

    expect(suggestColumnMapping(table)).toEqual({
      dateColumn: 0,
      descriptionColumn: 1,
      referenceColumn: 4,
      amountShape: { kind: "debitCredit", debitColumn: 2, creditColumn: 3 },
    });
  });

  it("suggests an amount/direction mapping when no debit/credit pair exists", () => {
    const table: RawTable = { headerRowIndex: 0, rows: [["Date", "Description", "Amount", "Type"]] };

    expect(suggestColumnMapping(table)).toEqual({
      dateColumn: 0,
      descriptionColumn: 1,
      amountShape: { kind: "amountDirection", amountColumn: 2, directionColumn: 3 },
    });
  });
});
