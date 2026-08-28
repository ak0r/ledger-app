import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { idfcFirstAccountXlsAdapter } from "./idfcFirstAccountXls";

// Synthetic IDFC FIRST Bank Account XLS fixture (AGENTS.md rules #23-#25) —
// same real workbook structure the adapter parses (label/value preamble
// grid, the Opening/Total Debit/Total Credit/Closing Balance summary, the
// Transaction Date/Value Date/Particulars/Cheque No./Debit/Credit/Balance
// table, the trailing Total/count rows, a second "Important Message"
// worksheet), but every value is fabricated: no real account number, name,
// address, or transaction ever appears here.
const FIXTURE_PATH = path.join(import.meta.dirname, "../../../fixtures/imports/idfc-first/account/sample.xlsx");
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);
const SCALE = 2;

describe("idfcFirstAccountXlsAdapter.detect", () => {
  it("detects an IDFC FIRST Bank account XLS statement", () => {
    expect(idfcFirstAccountXlsAdapter.detect("statement.xlsx", FIXTURE_BUFFER)).toBe(true);
  });

  it("rejects a non-.xls/.xlsx filename", () => {
    expect(idfcFirstAccountXlsAdapter.detect("statement.csv", FIXTURE_BUFFER)).toBe(false);
  });

  it("rejects a spreadsheet that isn't an IDFC FIRST Bank statement", () => {
    expect(idfcFirstAccountXlsAdapter.detect("statement.xlsx", Buffer.from("not a spreadsheet"))).toBe(false);
  });
});

describe("idfcFirstAccountXlsAdapter.parse", () => {
  const resultPromise = idfcFirstAccountXlsAdapter.parse(FIXTURE_BUFFER, SCALE);

  it("extracts the account number from the statement's label/value preamble", async () => {
    const result = await resultPromise;
    expect(result.accountIdentifier).toBe("00001234567");
  });

  it("parses every transaction row", async () => {
    const result = await resultPromise;
    expect(result.rows).toHaveLength(7);
  });

  it("sums debits/credits to match the fixture's own generated totals", async () => {
    const result = await resultPromise;
    const totalDebit = result.rows.filter((r) => r.direction === "debit").reduce((sum, r) => sum + r.amountMinor, 0);
    const totalCredit = result.rows.filter((r) => r.direction === "credit").reduce((sum, r) => sum + r.amountMinor, 0);
    expect(totalDebit).toBe(70000); // 150+300+250 = 700.00 in paise
    expect(totalCredit).toBe(126800); // 68+500+200+500 = 1268.00 in paise
  });

  it("parses a representative NACH debit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLEREF000001"));
    expect(row).toMatchObject({ date: "2026-04-07", direction: "debit", amountMinor: 15000 });
  });

  it("parses a representative NACH dividend credit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLE INTDIV"));
    expect(row).toMatchObject({ date: "2026-04-15", direction: "credit", amountMinor: 6800 });
  });

  it("parses a representative NEFT credit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.startsWith("NEFT/SAMPLEF000000004"));
    expect(row).toMatchObject({ date: "2026-04-18", direction: "credit", amountMinor: 50000 });
  });

  it("parses a cheque debit with the cheque number as reference", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "CHEQUE PAID -000456");
    expect(row).toMatchObject({ date: "2026-04-28", direction: "debit", amountMinor: 25000, reference: "000456" });
  });

  it("parses the monthly savings interest credit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "MONTHLY SAVINGS INTEREST CREDIT");
    expect(row).toMatchObject({ date: "2026-04-30", direction: "credit", amountMinor: 50000 });
  });
});
