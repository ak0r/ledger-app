// Real filesystem tests (not in-memory) — the behavior under test is file
// isolation itself, so a temp directory per test run is the honest way to
// verify it.
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "ledger-family-client-test-"));
  process.env.LEDGER_DATA_DIR = tempDir;
  // family-client.ts reads LEDGER_DATA_DIR into a module-level const at
  // import time — force a fresh evaluation per test so each test's env var
  // actually takes effect instead of reusing a module cached from an
  // earlier (now-deleted) temp dir.
  vi.resetModules();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.LEDGER_DATA_DIR;
});

// Each test imports family-client fresh (via vi.resetModules-free dynamic
// import per test) so the module-level connection cache doesn't leak
// between tests that reuse a family id string.
describe("provisionFamilyDb / getFamilyDb", () => {
  it("creates a migrated, queryable database file for a new Family", async () => {
    const { provisionFamilyDb, familyDbPath } = await import("./family-client");
    const { members } = await import("./schema");
    const { existsSync } = await import("node:fs");

    const familyId = "family-a";
    const db = provisionFamilyDb(familyId);

    expect(existsSync(familyDbPath(familyId))).toBe(true);
    expect(db.select().from(members).all()).toEqual([]);
  });

  it("getFamilyDb throws for an unprovisioned Family instead of silently creating one", async () => {
    const { getFamilyDb, familyDbPath } = await import("./family-client");
    const { existsSync } = await import("node:fs");

    expect(() => getFamilyDb("never-provisioned")).toThrow(/not found/i);
    expect(existsSync(familyDbPath("never-provisioned"))).toBe(false);
  });

  it("two Families' data never cross", async () => {
    const { provisionFamilyDb, getFamilyDb } = await import("./family-client");
    const { members } = await import("./schema");

    const dbA = provisionFamilyDb("family-a");
    const dbB = provisionFamilyDb("family-b");

    dbA.insert(members).values({
      id: "m1",
      name: "In Family A",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    expect(dbA.select().from(members).all()).toHaveLength(1);
    expect(dbB.select().from(members).all()).toHaveLength(0);

    // Re-resolving by id returns the same isolated dataset, not a fresh one.
    expect(getFamilyDb("family-a").select().from(members).all()).toHaveLength(1);
  });
});
