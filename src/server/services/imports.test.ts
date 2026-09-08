import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { findAccountsByProfile } from "../repositories/accounts";
import { findAccountIdentifiersByProfile, insertAccountIdentifier } from "../repositories/accountIdentifiers";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import * as XLSX from "xlsx";
import {
  buildPreviewFromRows,
  commitImport,
  listImports,
  previewCustomPdfImport,
  previewCustomXlsImport,
  previewImport,
  type CommitImportFile,
} from "./imports";
import { NotFoundError, UnrecognizedImportFormatError } from "./errors";

// Synthetic fixture (AGENTS.md rules #23-#25) — no real account/personal data.
const HDFC_FIXTURE = readFileSync(
  path.join(import.meta.dirname, "../../../fixtures/imports/hdfc/account/sample.xls"),
).toString("base64");

function setUpLedger(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  return { profile, currency };
}

const CSV = ["Date,Description,Debit,Credit", "2026-08-01,Coffee,150,", "2026-08-02,Salary,,50000"].join("\n");
const CSV_2 = ["Date,Description,Debit,Credit", "2026-09-01,Rent,20000,"].join("\n");

function toBase64(text: string): string {
  return Buffer.from(text).toString("base64");
}

// A no-institution-identifier source (generic CSV) always resolves as
// "unidentified" — the tests below drive that path with a manually-chosen
// `accountChoice` (existing account), same as a user resolving via the
// Identified Accounts UI. The HDFC-specific resolution paths (resolved/
// possibleMatch/ambiguous/new) are covered against synthetic identifiers
// further down, and end-to-end against the real fixture in
// import-adapters/hdfcAccountXls.test.ts + the browser E2E pass.
describe("previewImport", () => {
  it("parses a file and flags missing counterpart catch-alls, unidentified account", async () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);

    const preview = await previewImport(db, {
      profileId: profile.id,
      filename: "statement.csv",
      fileBase64: toBase64(CSV),
      fileKey: "file-1",
    });

    expect(preview.source).toBe("generic.any.csv");
    expect(preview.accountResolution.status).toBe("unidentified");
    expect(preview.candidates).toHaveLength(2);
    expect(preview.candidates.every((candidate) => candidate.knownAccountId === null)).toBe(true);
    expect(preview.newAccounts).toEqual(
      expect.arrayContaining([
        { key: "EXPENSE:unknown", classification: "EXPENSE", name: "Unknown" },
        { key: "INCOME:unknown", classification: "INCOME", name: "Unknown" },
      ]),
    );
  });

  it("throws UnrecognizedImportFormatError when no adapter recognizes the file", async () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);
    await expect(
      previewImport(db, { profileId: profile.id, filename: "statement.csv", fileBase64: toBase64(""), fileKey: "f" }),
    ).rejects.toThrow(UnrecognizedImportFormatError);
  });
});

// Ledger Custom Importer delta — `previewCustomXlsImport`/
// `previewCustomPdfImport` reuse the exact same account-resolution/
// candidate-building path as `previewImport` (`buildPreviewFromRows`
// internally) — these tests confirm that reuse, not the mapping logic
// itself (customImportMapping.test.ts already covers that in isolation).
describe("previewCustomXlsImport", () => {
  function toXlsBase64(rows: string[][]): string {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    return (XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer).toString("base64");
  }

  it("applies a confirmed column mapping and resolves accounts the same way an adapter-based import does", async () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);
    const fileBase64 = toXlsBase64([
      ["Date", "Description", "Debit", "Credit"],
      ["2026-08-01", "Coffee", "150", ""],
      ["2026-08-02", "Salary", "", "50000"],
    ]);

    const preview = await previewCustomXlsImport(db, {
      profileId: profile.id,
      filename: "statement.xlsx",
      fileBase64,
      fileKey: "f",
      mapping: {
        dateColumn: 0,
        dateFormat: "ISO",
        descriptionColumn: 1,
        amountShape: { kind: "debitCredit", debitColumn: 2, creditColumn: 3 },
        referenceColumn: null,
      },
    });

    expect(preview.source).toBe("custom.xls.manual");
    expect(preview.accountResolution.status).toBe("unidentified");
    expect(preview.candidates).toHaveLength(2);
    expect(preview.newAccounts).toEqual(
      expect.arrayContaining([
        { key: "EXPENSE:unknown", classification: "EXPENSE", name: "Unknown" },
        { key: "INCOME:unknown", classification: "INCOME", name: "Unknown" },
      ]),
    );
  });

  it("throws UnsupportedImportFormatError when the mapping yields no importable rows", async () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);
    const fileBase64 = toXlsBase64([["Date", "Description", "Debit", "Credit"]]);

    await expect(
      previewCustomXlsImport(db, {
        profileId: profile.id,
        filename: "statement.xlsx",
        fileBase64,
        fileKey: "f",
        mapping: {
          dateColumn: 0,
          dateFormat: "ISO",
          descriptionColumn: 1,
          amountShape: { kind: "debitCredit", debitColumn: 2, creditColumn: 3 },
          referenceColumn: null,
        },
      }),
    ).rejects.toThrow("no importable rows found");
  });
});

describe("previewCustomPdfImport", () => {
  // Reuses the same synthetic Federal Bank fixture as federalAccountPdf's
  // own tests (AGENTS.md rules #23-#25 — fabricated data throughout).
  const PDF_FIXTURE_BASE64 = readFileSync(
    path.join(import.meta.dirname, "../../../fixtures/imports/federal/account/sample.pdf"),
  ).toString("base64");
  const PDF_PASSWORD = "AMIT2807";

  it("applies a crop + column mapping and resolves accounts the same way an adapter-based import does", async () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);

    // A wide-open crop (the whole page) — this test exercises the
    // preview/resolution wiring, not crop-bounds filtering itself
    // (pdfTextExtraction.test.ts already covers that precisely).
    const wideRect = { x0: 0, y0: -1000, x1: 10_000, y1: 10_000 };
    const preview = await previewCustomPdfImport(db, {
      profileId: profile.id,
      filename: "statement.pdf",
      fileBase64: PDF_FIXTURE_BASE64,
      fileKey: "f",
      pages: [
        { pageNumber: 1, cropRect: wideRect },
        { pageNumber: 2, cropRect: wideRect },
      ],
      mapping: {
        dateColumn: 0,
        dateFormat: "DD_MON_YYYY",
        descriptionColumn: 2,
        amountShape: { kind: "debitCredit", debitColumn: 6, creditColumn: 7 },
        referenceColumn: null,
      },
      password: PDF_PASSWORD,
    });

    expect(preview.source).toBe("custom.pdf.manual");
    expect(preview.accountResolution.status).toBe("unidentified");
    expect(preview.transactionCount).toBeGreaterThan(0);
  });
});

// Account Resolution delta (2026-08-26) §10-§16 — driven against the
// synthetic HDFC fixture (AGENTS.md rules #23-#25 — fabricated account
// number 00001234567890, no real data) so `resolveImport` +
// `hdfcAccountXlsAdapter.parse` + the resolution engine are exercised
// together exactly as the browser flow does, not just the pure matcher.
describe("previewImport — account resolution", () => {
  async function previewHdfc(db: Db, profileId: string) {
    return previewImport(db, { profileId, filename: "statement.xls", fileBase64: HDFC_FIXTURE, fileKey: "file-1" });
  }

  it("proposes a new account when no identifier is known yet", async () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);

    const preview = await previewHdfc(db, profile.id);

    expect(preview.source).toBe("hdfc.account.xls");
    expect(preview.accountResolution).toMatchObject({
      status: "new",
      identifier: "00001234567890",
      proposedName: "HDFC Bank ••••7890",
      proposedClassification: "ASSET",
      proposedAccountType: "BANK",
    });
  });

  it("resolves directly on an exact identifier match", async () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", accountType: "BANK" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: bank.id, identifier: "00001234567890", createdAt: "now", updatedAt: "now" });

    const preview = await previewHdfc(db, profile.id);

    expect(preview.accountResolution).toMatchObject({ status: "resolved", resolvedAccountId: bank.id });
    expect(preview.candidates.every((c) => c.knownAccountId === bank.id)).toBe(true);
  });

  it("flags a possible match for a masked identifier sharing a significant suffix", async () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", accountType: "BANK" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: bank.id, identifier: "XX7890", createdAt: "now", updatedAt: "now" });

    const preview = await previewHdfc(db, profile.id);

    expect(preview.accountResolution.status).toBe("possibleMatch");
    expect(preview.accountResolution.candidates).toEqual([{ accountId: bank.id, accountName: "HDFC Bank", knownIdentifiers: ["XX7890"] }]);
  });

  it("flags ambiguous when a masked identifier matches more than one account", async () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank1 = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank 1", classification: "ASSET", accountType: "BANK" });
    const bank2 = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank 2", classification: "ASSET", accountType: "BANK" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: bank1.id, identifier: "XX7890", createdAt: "now", updatedAt: "now" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: bank2.id, identifier: "XXX7890", createdAt: "now", updatedAt: "now" });

    const preview = await previewHdfc(db, profile.id);

    expect(preview.accountResolution.status).toBe("ambiguous");
    expect(preview.accountResolution.candidates).toHaveLength(2);
  });
});

// Per-row source-account resolution (GPay importer delta) — a source with
// no single owning account of its own (`accountIdentifier: null` at the
// file level, same as generic CSV's "unidentified") but each row tags the
// real bank/card it moved money through.
describe("buildPreviewFromRows — per-row account resolution", () => {
  function row(accountIdentifier?: string | null) {
    return {
      date: "2026-09-10",
      description: "UPI payment",
      amountMinor: 50000,
      direction: "debit" as const,
      accountIdentifier,
    };
  }

  it("resolves a row to its own account on an exact identifier match, independent of the file's own (unidentified) resolution", () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", accountType: "BANK" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: bank.id, identifier: "0077", createdAt: "now", updatedAt: "now" });

    const preview = buildPreviewFromRows(db, profile.id, "file-1", "gpay.transactions.csv", [row("0077")], null, "GPay");

    expect(preview.accountResolution.status).toBe("unidentified");
    expect(preview.candidates[0]!.knownAccountId).toBe(bank.id);
  });

  it("falls back to the file's own resolution for a row with no identifier, or one that doesn't exactly match", () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", accountType: "BANK" });

    const preview = buildPreviewFromRows(
      db,
      profile.id,
      "file-1",
      "gpay.transactions.csv",
      [row(undefined), row("no-such-identifier")],
      null,
      "GPay",
    );

    expect(preview.candidates.every((c) => c.knownAccountId === null)).toBe(true);
  });

  it("never auto-resolves a row on a masked-suffix possible match — that still needs explicit confirmation", () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", accountType: "BANK" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: bank.id, identifier: "XX0077", createdAt: "now", updatedAt: "now" });

    const preview = buildPreviewFromRows(db, profile.id, "file-1", "gpay.transactions.csv", [row("0077")], null, "GPay");

    expect(preview.candidates[0]!.knownAccountId).toBeNull();
  });

  it("lets different rows in the same file resolve to different accounts", () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank1 = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "HDFC Bank", classification: "ASSET", accountType: "BANK" });
    const bank2 = createAccount(db, { profileId: profile.id, currencyId: currency.id, name: "ICICI Bank", classification: "ASSET", accountType: "BANK" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: bank1.id, identifier: "0077", createdAt: "now", updatedAt: "now" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: bank2.id, identifier: "1234", createdAt: "now", updatedAt: "now" });

    const preview = buildPreviewFromRows(db, profile.id, "file-1", "gpay.transactions.csv", [row("0077"), row("1234")], null, "GPay");

    expect(preview.candidates.map((c) => c.knownAccountId)).toEqual([bank1.id, bank2.id]);
  });
});

describe("commitImport", () => {
  function existingAccountFile(fileKey: string, accountId: string, filename = "statement.csv"): CommitImportFile {
    return { fileKey, filename, source: "generic.any.csv", identifier: null, accountChoice: { type: "existing", accountId } };
  }

  it("creates approved counterpart accounts, balanced transactions, and an ImportFile row", async () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    const preview = await previewImport(db, {
      profileId: profile.id,
      filename: "statement.csv",
      fileBase64: toBase64(CSV),
      fileKey: "file-1",
    });
    const candidates = preview.candidates.map((c) => ({ ...c, knownAccountId: bank.id }));

    const imported = commitImport(db, {
      profileId: profile.id,
      files: [existingAccountFile("file-1", bank.id)],
      candidates,
      approvedNewAccounts: preview.newAccounts,
      approvedNewSourceAccounts: [],
    });

    expect(imported).toHaveLength(1);
    expect(imported[0].transactionCount).toBe(2);
    expect(imported[0].status).toBe("successful");
    expect(imported[0].accountId).toBe(bank.id);
    expect(imported[0].outflowMinor).toBe(15000);
    expect(imported[0].inflowMinor).toBe(5000000);

    const accounts = findAccountsByProfile(db, profile.id);
    expect(accounts.some((a) => a.name === "Unknown" && a.classification === "EXPENSE")).toBe(true);
    expect(accounts.some((a) => a.name === "Unknown" && a.classification === "INCOME")).toBe(true);
    expect(listImports(db, profile.id)).toHaveLength(1);
  });

  it("commits multiple files in one workspace into their own ImportFile rows", async () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    const preview1 = await previewImport(db, { profileId: profile.id, filename: "aug.csv", fileBase64: toBase64(CSV), fileKey: "file-1" });
    const preview2 = await previewImport(db, { profileId: profile.id, filename: "sep.csv", fileBase64: toBase64(CSV_2), fileKey: "file-2" });

    const imported = commitImport(db, {
      profileId: profile.id,
      files: [existingAccountFile("file-1", bank.id, "aug.csv"), existingAccountFile("file-2", bank.id, "sep.csv")],
      candidates: [
        ...preview1.candidates.map((c) => ({ ...c, knownAccountId: bank.id })),
        ...preview2.candidates.map((c) => ({ ...c, knownAccountId: bank.id })),
      ],
      approvedNewAccounts: [...preview1.newAccounts, ...preview2.newAccounts],
      approvedNewSourceAccounts: [],
    });

    expect(imported).toHaveLength(2);
    const byFilename = new Map(imported.map((row) => [row.filename, row]));
    expect(byFilename.get("aug.csv")?.transactionCount).toBe(2);
    expect(byFilename.get("sep.csv")?.transactionCount).toBe(1);
  });

  it("creates a new source account with its identifier + derived variants when accountChoice is 'new'", async () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);

    const preview = await previewImport(db, {
      profileId: profile.id,
      filename: "statement.csv",
      fileBase64: toBase64(CSV),
      fileKey: "file-1",
    });

    const imported = commitImport(db, {
      profileId: profile.id,
      files: [
        {
          fileKey: "file-1",
          filename: "statement.csv",
          source: "generic.any.csv",
          identifier: "00009876543210",
          accountChoice: { type: "new", name: "HDFC Bank ••••3210", classification: "ASSET", accountType: "BANK" },
        },
      ],
      candidates: preview.candidates,
      approvedNewAccounts: preview.newAccounts,
      approvedNewSourceAccounts: [],
    });

    expect(imported[0].newAccountCount).toBe(1);
    const createdAccount = findAccountsByProfile(db, profile.id).find((a) => a.name === "HDFC Bank ••••3210");
    expect(createdAccount).toBeDefined();

    const identifiers = findAccountIdentifiersByProfile(db, profile.id)
      .filter((row) => row.accountId === createdAccount!.id)
      .map((row) => row.identifier)
      .sort();
    expect(identifiers).toEqual(["3210", "00009876543210", "XX3210", "XXX3210"].sort());
  });

  it("learns a newly-observed identifier for an existing account (§14)", async () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    const preview = await previewImport(db, { profileId: profile.id, filename: "statement.csv", fileBase64: toBase64(CSV), fileKey: "file-1" });
    commitImport(db, {
      profileId: profile.id,
      files: [{ fileKey: "file-1", filename: "statement.csv", source: "generic.any.csv", identifier: "XX3210", accountChoice: { type: "existing", accountId: bank.id } }],
      candidates: preview.candidates.map((c) => ({ ...c, knownAccountId: bank.id })),
      approvedNewAccounts: preview.newAccounts,
      approvedNewSourceAccounts: [],
    });

    const identifiers = findAccountIdentifiersByProfile(db, profile.id).map((row) => row.identifier);
    expect(identifiers).toContain("XX3210");
  });

  it("throws NotFoundError instead of committing when a required counterpart account wasn't approved", async () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const bank = createAccount(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    const preview = await previewImport(db, { profileId: profile.id, filename: "statement.csv", fileBase64: toBase64(CSV), fileKey: "file-1" });

    expect(() =>
      commitImport(db, {
        profileId: profile.id,
        files: [existingAccountFile("file-1", bank.id)],
        candidates: preview.candidates.map((c) => ({ ...c, knownAccountId: bank.id })),
        approvedNewAccounts: [],
        approvedNewSourceAccounts: [],
      }),
    ).toThrow(NotFoundError);

    expect(listImports(db, profile.id)).toHaveLength(0);
  });
});

// Cross-source reconciliation against already-committed history (GPay
// importer delta) — the within-session cross-file check lives client-side
// (`import-workspace.tsx`); this is the other half, run server-side in
// `buildPreviewFromRows` against real committed Postings. Both rows carry
// a real, resolving `accountIdentifier` (same as gpayPdf.ts's own Stone 1
// per-row resolution) so `knownAccountId` is already set by the time
// `buildPreviewFromRows`'s own internal reconciliation check runs —
// setting it after the fact wouldn't retroactively trigger that check.
describe("buildPreviewFromRows — reconciliation against committed history", () => {
  function setUpAxisAccount(db: Db, profileId: string, currencyId: string) {
    const axis = createAccount(db, { profileId, currencyId, name: "Axis Bank", classification: "ASSET", accountType: "BANK" });
    insertAccountIdentifier(db, { id: crypto.randomUUID(), accountId: axis.id, identifier: "5245", createdAt: "now", updatedAt: "now" });
    return axis;
  }

  function commitOneRow(db: Db, profileId: string, axisId: string, row: { date: string; description: string; amountMinor: number; direction: "debit" | "credit"; reference?: string; counterparty?: string }) {
    const preview = buildPreviewFromRows(db, profileId, "file-axis", "axis.account.xls", [{ ...row, accountIdentifier: "5245" }], null, "Axis Bank");
    commitImport(db, {
      profileId,
      files: [{ fileKey: "file-axis", filename: "axis.xls", source: "axis.account.xls", identifier: null, accountChoice: { type: "existing", accountId: axisId } }],
      candidates: preview.candidates,
      approvedNewAccounts: preview.newAccounts,
      approvedNewSourceAccounts: [],
    });
  }

  it("flags a new import row as a possible duplicate of an already-committed Transaction, by exact reference (UTR)", () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const axis = setUpAxisAccount(db, profile.id, currency.id);
    commitOneRow(db, profile.id, axis.id, { date: "2026-08-01", description: "Axis's own narration", amountMinor: 2000000, direction: "debit", reference: "621330415831" });

    const gpayPreview = buildPreviewFromRows(
      db,
      profile.id,
      "file-gpay",
      "gpay.transactions.pdf",
      [{ date: "2026-08-01", description: "Self transfer to Federal Bank 1220", amountMinor: 2000000, direction: "debit", reference: "621330415831", accountIdentifier: "5245" }],
      null,
      "Google Pay",
    );

    expect(gpayPreview.candidates[0]!.knownAccountId).toBe(axis.id);
    expect(gpayPreview.candidates[0]!.possibleDuplicate).toBe("reference");
  });

  it("flags a heuristic match (date + amount + direction + account, no reference) against committed history", () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const axis = setUpAxisAccount(db, profile.id, currency.id);
    commitOneRow(db, profile.id, axis.id, { date: "2026-08-05", description: "Axis's own narration", amountMinor: 172500, direction: "debit", counterparty: "DHAIRYASHIL B BODAKE" });

    const gpayPreview = buildPreviewFromRows(
      db,
      profile.id,
      "file-gpay",
      "gpay.transactions.pdf",
      [{ date: "2026-08-05", description: "Paid to D B", amountMinor: 172500, direction: "debit", accountIdentifier: "5245" }],
      null,
      "Google Pay",
    );

    expect(gpayPreview.candidates[0]!.possibleDuplicate).toBe("heuristic");
  });

  it("does not flag a new import row when nothing in history matches (different amount)", () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const axis = setUpAxisAccount(db, profile.id, currency.id);
    commitOneRow(db, profile.id, axis.id, { date: "2026-08-01", description: "Axis's own narration", amountMinor: 2000000, direction: "debit", reference: "621330415831" });

    const gpayPreview = buildPreviewFromRows(
      db,
      profile.id,
      "file-gpay",
      "gpay.transactions.pdf",
      [{ date: "2026-08-01", description: "A genuinely different payment", amountMinor: 500, direction: "debit", reference: "000000000000", accountIdentifier: "5245" }],
      null,
      "Google Pay",
    );

    expect(gpayPreview.candidates[0]!.possibleDuplicate).toBeNull();
  });

  it("does not flag a row that never resolved to a real Account", () => {
    const db = createTestDb();
    const { profile, currency } = setUpLedger(db);
    const axis = setUpAxisAccount(db, profile.id, currency.id);
    commitOneRow(db, profile.id, axis.id, { date: "2026-08-01", description: "Axis's own narration", amountMinor: 2000000, direction: "debit", reference: "621330415831" });

    // No accountIdentifier at all this time — stays unresolved.
    const gpayPreview = buildPreviewFromRows(
      db,
      profile.id,
      "file-gpay",
      "gpay.transactions.pdf",
      [{ date: "2026-08-01", description: "Self transfer to Federal Bank 1220", amountMinor: 2000000, direction: "debit", reference: "621330415831" }],
      null,
      "Google Pay",
    );

    expect(gpayPreview.candidates[0]!.knownAccountId).toBeNull();
    expect(gpayPreview.candidates[0]!.possibleDuplicate).toBeNull();
  });
});

// Real bug, reported against the running app: a GPay row routed through a
// credit card the user hadn't added yet ("Federal Bank XX97 | RuPay
// credit card") silently landed on whichever account the rest of the
// file resolved to, instead of surfacing as its own new-Account proposal.
describe("buildPreviewFromRows — per-row new source Account proposals (GPay importer delta)", () => {
  function creditCardRow() {
    return {
      date: "2026-08-01",
      description: "Paid to WASTELAND ENTERTAINMENT PRIVATE LIMITED DISTRICT EVENT UPI",
      amountMinor: 150000,
      direction: "debit" as const,
      reference: "621319236710",
      accountIdentifier: "97",
      proposedAccountName: "Federal Bank ••97",
      proposedAccountType: "CREDIT_CARD" as const,
      proposedAccountClassification: "LIABILITY" as const,
    };
  }

  it("proposes a new Liability/CREDIT_CARD Account for an identifier that matches nothing existing, instead of deferring to the file default", () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);

    const preview = buildPreviewFromRows(db, profile.id, "file-gpay", "gpay.transactions.pdf", [creditCardRow()], null, "Google Pay");

    expect(preview.newSourceAccounts).toEqual([
      { key: "source:97", identifier: "97", name: "Federal Bank ••97", classification: "LIABILITY", accountType: "CREDIT_CARD" },
    ]);
    expect(preview.candidates[0]).toMatchObject({ knownAccountId: null, proposedSourceAccountKey: "source:97" });
  });

  it("collapses multiple rows sharing the same unresolved identifier into one proposal", () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);

    const preview = buildPreviewFromRows(
      db,
      profile.id,
      "file-gpay",
      "gpay.transactions.pdf",
      [creditCardRow(), { ...creditCardRow(), date: "2026-08-05", reference: "621780459927" }],
      null,
      "Google Pay",
    );

    expect(preview.newSourceAccounts).toHaveLength(1);
    expect(preview.candidates.every((c) => c.proposedSourceAccountKey === "source:97")).toBe(true);
  });

  it("creates the proposed Account (with the identifier + its masked variants) and posts against it once approved", () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);

    const preview = buildPreviewFromRows(db, profile.id, "file-gpay", "gpay.transactions.pdf", [creditCardRow()], null, "Google Pay");

    const imported = commitImport(db, {
      profileId: profile.id,
      files: [{ fileKey: "file-gpay", filename: "gpay.pdf", source: "gpay.transactions.pdf", identifier: null, accountChoice: { type: "new", name: "GPay fallback", classification: "ASSET", accountType: "BANK" } }],
      candidates: preview.candidates,
      approvedNewAccounts: preview.newAccounts,
      approvedNewSourceAccounts: preview.newSourceAccounts,
    });

    expect(imported).toHaveLength(1);
    const created = findAccountsByProfile(db, profile.id).find((a) => a.name === "Federal Bank ••97");
    expect(created).toMatchObject({ classification: "LIABILITY", accountType: "CREDIT_CARD" });
    const identifiers = findAccountIdentifiersByProfile(db, profile.id)
      .filter((row) => row.accountId === created!.id)
      .map((row) => row.identifier);
    expect(identifiers).toContain("97");
  });

  it("throws NotFoundError when a proposed source Account was never approved", () => {
    const db = createTestDb();
    const { profile } = setUpLedger(db);
    const preview = buildPreviewFromRows(db, profile.id, "file-gpay", "gpay.transactions.pdf", [creditCardRow()], null, "Google Pay");

    expect(() =>
      commitImport(db, {
        profileId: profile.id,
        files: [{ fileKey: "file-gpay", filename: "gpay.pdf", source: "gpay.transactions.pdf", identifier: null, accountChoice: { type: "new", name: "GPay fallback", classification: "ASSET", accountType: "BANK" } }],
        candidates: preview.candidates,
        approvedNewAccounts: preview.newAccounts,
        approvedNewSourceAccounts: [],
      }),
    ).toThrow(NotFoundError);
  });
});
