import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "../services/profiles";
import { previewCasImportCore, runCasImportCore } from "./casImport.core";

describe("runCasImportCore", () => {
  it("surfaces an unknown Currency as a failed ActionResult, not a thrown error", async () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    // runCasImportCore always uses the real runner internally (no DI
    // parameter at this layer — that's services/casImport.ts's own
    // concern, already covered by casImport.test.ts's stubbed-runner
    // suite). This test only exercises the NotFoundError boundary — a
    // real Profile (so the PortfolioImport row's own FK succeeds) but a
    // Currency that doesn't exist, caught before any subprocess would
    // ever spawn.
    const result = await runCasImportCore(
      db,
      { profileId: profile.id, password: "x", currencyId: "not-a-real-currency" },
      Buffer.from(""),
    );
    expect(result.success).toBe(false);
  });

  it("rejects input missing a currencyId", async () => {
    const db = createTestDb();
    const result = await runCasImportCore(db, { profileId: "p1", password: "x" }, Buffer.from(""));
    expect(result.success).toBe(false);
  });
});

describe("previewCasImportCore", () => {
  // No currencyId in this schema at all (preview never converts a Money
  // value) — the one thing left to validate at this layer is profileId.
  it("rejects input missing a profileId", async () => {
    const db = createTestDb();
    const result = await previewCasImportCore(db, { password: "x" }, Buffer.from(""));
    expect(result.success).toBe(false);
  });
});
