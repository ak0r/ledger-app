import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { federalAccountPdfAdapter } from "./federalAccountPdf";
import { PasswordRequiredError } from "../use-cases/errors";

// Synthetic Federal Bank Account PDF fixture (AGENTS.md rules #23-#25) —
// same real statement structure the adapter parses (label/value preamble,
// a Date/Value Date/Particulars/Tran Type/Tran ID/Cheque Details/
// Withdrawals/Deposits/Balance/DR-CR table with a wrapped multi-line
// Particulars entry, a "The Federal Bank Ltd." footer on a second page),
// but every value is fabricated — no real account number, name, or
// transaction ever appears here. Password-protected with "AMIT2807" (the
// exact real-world convention this adapter is built against), same as the
// production statements this adapter parses; the password is never
// persisted anywhere, only passed through the one `parse()` call under
// test.
const FIXTURE_PATH = path.join(import.meta.dirname, "../../../fixtures/imports/federal/account/sample.pdf");
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);
const PASSWORD = "AMIT2807";
const SCALE = 2;

describe("federalAccountPdfAdapter.detect", () => {
  it("detects a PDF file by extension and magic bytes, even while still encrypted", () => {
    expect(federalAccountPdfAdapter.detect("statement.pdf", FIXTURE_BUFFER)).toBe(true);
  });

  it("rejects a non-.pdf filename", () => {
    expect(federalAccountPdfAdapter.detect("statement.xls", FIXTURE_BUFFER)).toBe(false);
  });

  it("rejects a .pdf-named file that isn't actually a PDF", () => {
    expect(federalAccountPdfAdapter.detect("statement.pdf", Buffer.from("not a pdf"))).toBe(false);
  });
});

describe("federalAccountPdfAdapter.parse — password handling", () => {
  it("throws PasswordRequiredError('required') when no password is given", async () => {
    await expect(federalAccountPdfAdapter.parse(FIXTURE_BUFFER, SCALE)).rejects.toMatchObject({
      constructor: PasswordRequiredError,
      reason: "required",
    });
  });

  it("throws PasswordRequiredError('incorrect') for a wrong password", async () => {
    await expect(federalAccountPdfAdapter.parse(FIXTURE_BUFFER, SCALE, "wrong")).rejects.toMatchObject({
      constructor: PasswordRequiredError,
      reason: "incorrect",
    });
  });

  it("rejects the correct password in the wrong case (case-sensitive)", async () => {
    await expect(federalAccountPdfAdapter.parse(FIXTURE_BUFFER, SCALE, "amit2807")).rejects.toMatchObject({
      constructor: PasswordRequiredError,
      reason: "incorrect",
    });
  });

  it("succeeds with the exact-case correct password", async () => {
    const result = await federalAccountPdfAdapter.parse(FIXTURE_BUFFER, SCALE, PASSWORD);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});

describe("federalAccountPdfAdapter.parse — decrypted content", () => {
  const resultPromise = federalAccountPdfAdapter.parse(FIXTURE_BUFFER, SCALE, PASSWORD);

  it("extracts the account number from the statement's preamble", async () => {
    const result = await resultPromise;
    expect(result.accountIdentifier).toBe("00001234567");
  });

  it("parses every transaction row, including one with a wrapped multi-line description", async () => {
    const result = await resultPromise;
    expect(result.rows).toHaveLength(6);
  });

  it("sums debits/credits to match the fixture's own generated totals", async () => {
    const result = await resultPromise;
    const totalDebit = result.rows.filter((r) => r.direction === "debit").reduce((sum, r) => sum + r.amountMinor, 0);
    const totalCredit = result.rows.filter((r) => r.direction === "credit").reduce((sum, r) => sum + r.amountMinor, 0);
    expect(totalDebit).toBe(146300); // 500+300+663 = 1463.00 in paise
    expect(totalCredit).toBe(935000); // 1200+8000+150 = 9350.00 in paise
  });

  it("parses a representative UPI debit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLE PERSON") && !r.description.includes("TWO"));
    expect(row).toMatchObject({ date: "2026-04-04", direction: "debit", amountMinor: 50000, reference: "S00000001" });
  });

  it("parses a representative UPI credit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLE SENDER") && !r.description.includes("TWO"));
    expect(row).toMatchObject({ date: "2026-04-06", direction: "credit", amountMinor: 120000 });
  });

  it("joins a wrapped two-line Particulars entry into one description", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.includes("SAMPLE PERSON TWO"));
    expect(row).toMatchObject({
      date: "2026-04-10",
      direction: "debit",
      amountMinor: 30000,
      description: "UPIOUT/000000000003/SAMPLE PERSON TWO 170000000000@sample/0001",
    });
  });

  it("parses the monthly savings interest credit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description.startsWith("SBINT"));
    expect(row).toMatchObject({ date: "2026-04-30", direction: "credit", amountMinor: 15000 });
  });
});

