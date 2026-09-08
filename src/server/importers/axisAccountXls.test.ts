import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { axisAccountXlsAdapter } from "./axisAccountXls";

// Synthetic Axis Account XLS fixture (AGENTS.md rules #23-#25) — same real
// workbook structure the adapter parses (preamble, "Statement of Axis
// Account No -" line, the SRL NO/Tran Date/CHQNO/Particulars/DR/CR/Bal/SOL
// transaction table, the closing legend text), but every value is
// fabricated: no real account number, name, address, or transaction ever
// appears here.
const FIXTURE_PATH = path.join(import.meta.dirname, "../../../fixtures/imports/axis/account/sample.xls");
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);
const SCALE = 2;

describe("axisAccountXlsAdapter.detect", () => {
  it("detects an Axis account XLS statement", () => {
    expect(axisAccountXlsAdapter.detect("statement.xls", FIXTURE_BUFFER)).toBe(true);
  });

  it("rejects a non-.xls filename", () => {
    expect(axisAccountXlsAdapter.detect("statement.csv", FIXTURE_BUFFER)).toBe(false);
  });

  it("rejects an .xls file that isn't an Axis statement", () => {
    expect(axisAccountXlsAdapter.detect("statement.xls", Buffer.from("not a spreadsheet"))).toBe(false);
  });
});

describe("axisAccountXlsAdapter.parse", () => {
  const resultPromise = axisAccountXlsAdapter.parse(FIXTURE_BUFFER, SCALE);

  it("extracts the account number from the statement header", async () => {
    const result = await resultPromise;
    expect(result.accountIdentifier).toBe("000012345678");
  });

  it("parses every transaction row", async () => {
    const result = await resultPromise;
    expect(result.rows).toHaveLength(10);
  });

  it("sums debits/credits to match the fixture's own generated totals", async () => {
    const result = await resultPromise;
    const totalDebit = result.rows.filter((r) => r.direction === "debit").reduce((sum, r) => sum + r.amountMinor, 0);
    const totalCredit = result.rows.filter((r) => r.direction === "credit").reduce((sum, r) => sum + r.amountMinor, 0);
    expect(totalDebit).toBe(1171500); // 500+5000+3000+1200+2000+15 = 11715.00 in paise
    expect(totalCredit).toBe(3435000); // 1200+25000+8000+150 = 34350.00 in paise
  });

  it("parses a representative UPI debit, extracting the UPI transaction ID (UTR) as reference", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLE PERSON/UTIB"));
    expect(row).toMatchObject({ date: "2026-04-05", direction: "debit", amountMinor: 50000, reference: "000000000001" });
  });

  it("parses a representative UPI credit, extracting the UPI transaction ID (UTR) as reference", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLE PERSON TWO"));
    expect(row).toMatchObject({ date: "2026-04-06", direction: "credit", amountMinor: 120000, reference: "000000000002" });
  });

  it("extracts the UTR from a UPI merchant payment (P2M) the same way as a person-to-person one (P2A)", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLE MERCHANT"));
    expect(row).toMatchObject({ date: "2026-04-25", direction: "debit", amountMinor: 120000, reference: "000000000006" });
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

  it("parses a cheque debit with the cheque number as reference", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "CHQ PAID -000123");
    expect(row).toMatchObject({ date: "2026-04-22", direction: "debit", amountMinor: 300000, reference: "000123" });
  });

  it("parses a representative bank charge", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "SMS ALERT CHARGES");
    expect(row).toMatchObject({ date: "2026-04-30", direction: "debit", amountMinor: 1500 });
  });

  it("parses interest credited to the account", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.startsWith("INT.PD"));
    expect(row).toMatchObject({ date: "2026-05-01", direction: "credit", amountMinor: 15000 });
  });
});
