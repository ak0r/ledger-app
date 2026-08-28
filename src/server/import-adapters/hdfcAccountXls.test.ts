import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hdfcAccountXlsAdapter } from "./hdfcAccountXls";

// Synthetic HDFC Account XLS fixture (AGENTS.md rules #23-#25) — same real
// workbook structure the adapter parses (header preamble, "Account No :"
// line, the Date/Narration/.../Closing Balance transaction table, the
// STATEMENT SUMMARY block), but every value is fabricated: no real account
// number, name, address, or transaction ever appears here. Expected sums
// below come from the fixture's own generator script, not from a real
// statement's numbers.
const FIXTURE_PATH = path.join(import.meta.dirname, "../../../fixtures/imports/hdfc/account/sample.xls");
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);
const SCALE = 2;

describe("hdfcAccountXlsAdapter.detect", () => {
  it("detects an HDFC account XLS statement", () => {
    expect(hdfcAccountXlsAdapter.detect("statement.xls", FIXTURE_BUFFER)).toBe(true);
  });

  it("rejects a non-.xls filename", () => {
    expect(hdfcAccountXlsAdapter.detect("statement.csv", FIXTURE_BUFFER)).toBe(false);
  });

  it("rejects an .xls file that isn't an HDFC statement", () => {
    expect(hdfcAccountXlsAdapter.detect("statement.xls", Buffer.from("not a spreadsheet"))).toBe(false);
  });
});

describe("hdfcAccountXlsAdapter.parse", () => {
  const resultPromise = hdfcAccountXlsAdapter.parse(FIXTURE_BUFFER, SCALE);

  it("extracts the account number from the statement header", async () => {
    const result = await resultPromise;
    expect(result.accountIdentifier).toBe("00001234567890");
  });

  it("parses every transaction row (matches the fixture's own Dr Count + Cr Count = 7 + 3 = 10)", async () => {
    const result = await resultPromise;
    expect(result.rows).toHaveLength(10);
  });

  it("sums debits/credits to match the fixture's own STATEMENT SUMMARY totals", async () => {
    const result = await resultPromise;
    const totalDebit = result.rows.filter((r) => r.direction === "debit").reduce((sum, r) => sum + r.amountMinor, 0);
    const totalCredit = result.rows.filter((r) => r.direction === "credit").reduce((sum, r) => sum + r.amountMinor, 0);
    expect(totalDebit).toBe(1221500); // 12215.00 in paise
    expect(totalCredit).toBe(3315000); // 33150.00 in paise
  });

  it("parses a representative ACH debit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("ACH D- SAMPLE UTILITY LTD-000000001"));
    expect(row).toMatchObject({ date: "2026-04-05", direction: "debit", amountMinor: 50000, reference: "0000000000000001" });
  });

  it("parses a representative UPI debit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLE MERCHANT"));
    expect(row).toMatchObject({ date: "2026-04-06", direction: "debit", amountMinor: 120000 });
  });

  it("parses a representative NEFT credit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.startsWith("NEFT CR-SAMP0000001"));
    expect(row).toMatchObject({ date: "2026-04-10", direction: "credit", amountMinor: 2500000 });
  });

  it("parses a representative NEFT debit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.startsWith("NEFT DR-SAMP0000002"));
    expect(row).toMatchObject({ date: "2026-04-15", direction: "debit", amountMinor: 500000 });
  });

  it("parses a representative IMPS credit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.startsWith("IMPS-000000000005"));
    expect(row).toMatchObject({ date: "2026-04-20", direction: "credit", amountMinor: 800000 });
  });

  it("parses a representative bank charge", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "SMS ALERT CHARGES");
    expect(row).toMatchObject({ date: "2026-04-30", direction: "debit", amountMinor: 1500 });
  });

  it("parses interest credited to the account", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.startsWith("INTEREST PAID"));
    expect(row).toMatchObject({ date: "2026-05-01", direction: "credit", amountMinor: 15000 });
  });
});
