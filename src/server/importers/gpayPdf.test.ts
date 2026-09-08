import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gpayPdfAdapter } from "./gpayPdf";
import { UnrecognizedImportFormatError } from "../services/errors";

// Synthetic Google Pay transaction statement fixture (AGENTS.md rules
// #23-#25) — same real statement structure this adapter parses (a "Date &
// time / Transaction details / Amount" header repeated on every page,
// positioned text at the real statement's own column x-anchors, a "Paid
// by"/"Paid to <bank>" account line indented under the description, "UPI
// Transaction ID:" reference lines, a Google Pay footer note) — but every
// phone/email/name/bank/amount/UPI ID is fabricated. No currency symbol
// in the Amount column: standard (non-embedded) PDF fonts have no glyph
// for "₹", and the adapter's own amount parsing already has to tolerate
// that same gap for a real export whose font subsetting drops the glyph.
// Deliberately 2 pages, split mid-row-3/row-4 (the row right before the
// break is the "Self transfer" one, asserted below by name) — a real bug
// only showed up against a real 2-page statement: page 2's own repeated
// header was misread as the still-open previous row's amount line,
// silently corrupting and dropping it. A 1-page fixture never exercises
// that path at all.
const FIXTURE_PATH = path.join(import.meta.dirname, "../../../fixtures/imports/gpay/transactions/sample.pdf");
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);
const SCALE = 2;

describe("gpayPdfAdapter.detect", () => {
  it("detects a PDF file by extension and magic bytes", () => {
    expect(gpayPdfAdapter.detect("statement.pdf", FIXTURE_BUFFER)).toBe(true);
  });

  it("rejects a non-.pdf filename", () => {
    expect(gpayPdfAdapter.detect("statement.csv", FIXTURE_BUFFER)).toBe(false);
  });

  it("rejects a .pdf-named file that isn't actually a PDF", () => {
    expect(gpayPdfAdapter.detect("statement.pdf", Buffer.from("not a pdf"))).toBe(false);
  });
});

describe("gpayPdfAdapter.parse", () => {
  const resultPromise = gpayPdfAdapter.parse(FIXTURE_BUFFER, SCALE);

  it("has no single owning source account — GPay itself is not an Account", async () => {
    const result = await resultPromise;
    expect(result.accountIdentifier).toBeNull();
  });

  it("parses every transaction row", async () => {
    const result = await resultPromise;
    expect(result.rows).toHaveLength(6);
  });

  it("parses a plain merchant debit, tagging the paying account's bare last-4-digit suffix", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "Paid to Fresh Mart Groceries");
    expect(row).toMatchObject({
      date: "2026-09-01",
      direction: "debit",
      amountMinor: 120000,
      reference: "100000000001",
      accountIdentifier: "1111",
    });
  });

  it("parses an inflow ('Received from') tagging the receiving account, direction credit", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "Received from Jordan Lee");
    expect(row).toMatchObject({ date: "2026-09-03", direction: "credit", amountMinor: 80000, accountIdentifier: "1111" });
  });

  it("parses a self-transfer as a debit from the paying account (no counter-account resolution)", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "Self transfer to Other Bank 2222");
    expect(row).toMatchObject({ date: "2026-09-05", direction: "debit", amountMinor: 500000, accountIdentifier: "1111" });
  });

  it("extracts only the masked 2-digit suffix for a credit-card-routed payment (won't exact-match a bank statement's 4-digit identifier)", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "Paid to Toll Plaza FASTag");
    expect(row).toMatchObject({ direction: "debit", amountMinor: 15000, accountIdentifier: "99" });
  });

  it("treats a UPI Lite payment as its underlying bank account", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "Paid to Coffee Shop");
    expect(row).toMatchObject({ direction: "debit", amountMinor: 22000, accountIdentifier: "1111" });
  });

  it("parses a UPI Lite top-up as a debit from the funding account", async () => {
    const result = await resultPromise;
    const row = result.rows.find((r) => r.description === "Top-up to UPI Lite");
    expect(row).toMatchObject({ date: "2026-09-11", direction: "debit", amountMinor: 200000, accountIdentifier: "1111" });
  });

  it("rejects a real, valid, unencrypted PDF that isn't a Google Pay statement", async () => {
    // A tiny hand-built valid PDF ("Some Other Bank Statement", no Google
    // Pay/UPI marker) — proves detect()'s magic-byte check alone isn't
    // trusted as a real match, `parse()` is (`resolveImportFrom`'s own
    // "detect is cheap, parse confirms" posture, same as every other
    // adapter here).
    const otherPdf = Buffer.from(
      "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNjUgPj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgoxIDAgMCAxIDI0IDcwMCBUbQooU29tZSBPdGhlciBCYW5rIFN0YXRlbWVudCkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMzOCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ1MgolJUVPRg==",
      "base64",
    );
    await expect(gpayPdfAdapter.parse(otherPdf, SCALE)).rejects.toThrow(UnrecognizedImportFormatError);
  });
});
