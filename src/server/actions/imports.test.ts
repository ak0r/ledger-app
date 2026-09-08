import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "../services/profiles";
import { createCurrency } from "../services/currencies";
import { createAccount } from "../services/accounts";
import { commitImportCore, previewImportCore } from "./imports.core";

function setUp(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const bank = createAccount(db, {
    profileId: profile.id,
    currencyId: currency.id,
    name: "HDFC Bank",
    classification: "ASSET",
    accountType: "BANK",
  });
  return { profile, bank };
}

const CSV = ["Date,Description,Debit,Credit", "2026-08-01,Coffee,150,", "2026-08-02,Salary,,50000"].join("\n");

function toBase64(text: string): string {
  return Buffer.from(text).toString("base64");
}

describe("previewImportCore", () => {
  it("rejects malformed input before it reaches the use-case", async () => {
    const db = createTestDb();
    const result = await previewImportCore(db, { profileId: "", filename: "", fileBase64: "", fileKey: "" });
    expect(result.success).toBe(false);
  });

  it("previews a valid upload", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const result = await previewImportCore(db, {
      profileId: profile.id,
      filename: "statement.csv",
      fileBase64: toBase64(CSV),
      fileKey: "file-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.candidates).toHaveLength(2);
      expect(result.data.newAccounts).toHaveLength(2);
      expect(result.data.accountResolution.status).toBe("unidentified");
    }
  });
});

describe("commitImportCore", () => {
  it("commits an approved preview end to end", async () => {
    const db = createTestDb();
    const { profile, bank } = setUp(db);

    const preview = await previewImportCore(db, {
      profileId: profile.id,
      filename: "statement.csv",
      fileBase64: toBase64(CSV),
      fileKey: "file-1",
    });
    expect(preview.success).toBe(true);
    if (!preview.success) return;

    const result = commitImportCore(db, {
      profileId: profile.id,
      files: [
        {
          fileKey: "file-1",
          filename: "statement.csv",
          source: "generic.any.csv",
          identifier: null,
          accountChoice: { type: "existing", accountId: bank.id },
        },
      ],
      candidates: preview.data.candidates.map((c) => ({ ...c, knownAccountId: bank.id })),
      approvedNewAccounts: preview.data.newAccounts,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].transactionCount).toBe(2);
      expect(result.data[0].status).toBe("successful");
      expect(result.data[0].accountId).toBe(bank.id);
    }
  });

  it("surfaces a domain error as a failed ActionResult rather than throwing", async () => {
    const db = createTestDb();
    const { profile, bank } = setUp(db);

    const preview = await previewImportCore(db, {
      profileId: profile.id,
      filename: "statement.csv",
      fileBase64: toBase64(CSV),
      fileKey: "file-1",
    });
    expect(preview.success).toBe(true);
    if (!preview.success) return;

    const result = commitImportCore(db, {
      profileId: profile.id,
      files: [
        {
          fileKey: "file-1",
          filename: "statement.csv",
          source: "generic.any.csv",
          identifier: null,
          accountChoice: { type: "existing", accountId: bank.id },
        },
      ],
      candidates: preview.data.candidates.map((c) => ({ ...c, knownAccountId: bank.id })),
      approvedNewAccounts: [],
    });

    expect(result.success).toBe(false);
  });
});
