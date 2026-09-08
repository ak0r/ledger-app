import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "../services/profiles";
import { createCurrency } from "../services/currencies";
import { archiveAccountCore, createAccountCore, editAccountCore } from "./accounts.core";

function setUp(db: Db) {
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

describe("createAccountCore", () => {
  it("creates an Account for an existing Currency", () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);

    const result = createAccountCore(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown classification enum value — fast client feedback", () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);

    const result = createAccountCore(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "NOT_A_REAL_CLASSIFICATION",
      accountType: "BANK",
    });

    expect(result.success).toBe(false);
  });

  it("rejects classification: BALANCING — system-managed, not a normal user-creatable classification (2026-08-19 delta §3/§14, rule #17 defense-in-depth on top of hiding it from the picker)", () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);

    const result = createAccountCore(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "Should be rejected",
      classification: "BALANCING",
      accountType: "INITIAL",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a Currency belonging to a different Profile", () => {
    const db = createTestDb();
    const { currency } = setUp(db);
    const otherProfile = createProfile(db, { name: "Partner" });

    const result = createAccountCore(db, {
      profileId: otherProfile.id,
      currencyId: currency.id,
      name: "Should fail",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(result.success).toBe(false);
  });
});

describe("archiveAccountCore", () => {
  it("archives an existing Account", () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    const created = createAccountCore(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });
    if (!created.success) throw new Error("setup failed");

    const result = archiveAccountCore(db, {
      profileId: profile.id,
      accountId: created.data.id,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isArchived).toBe(true);
  });
});

describe("editAccountCore", () => {
  it("updates an existing Account", () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    const created = createAccountCore(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });
    if (!created.success) throw new Error("setup failed");

    const result = editAccountCore(db, {
      profileId: profile.id,
      accountId: created.data.id,
      currencyId: currency.id,
      name: "HDFC Bank — Salary",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("HDFC Bank — Salary");
  });

  it("still allows editing an existing BALANCING account — only creation is restricted", () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    // Balancing accounts are seeded directly (src/server/demo/dataset.ts),
    // not via createAccountCore (which now rejects that classification) —
    // insert one the same way, then confirm editAccountCore still accepts
    // its unchanged classification on a normal field edit.
    const balancing = createAccountCore(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "Opening Balance",
      classification: "ASSET",
      accountType: "BANK",
    });
    if (!balancing.success) throw new Error("setup failed");

    const result = editAccountCore(db, {
      profileId: profile.id,
      accountId: balancing.data.id,
      currencyId: currency.id,
      name: "Opening Balance — renamed",
      classification: "BALANCING",
      accountType: "INITIAL",
    });

    expect(result.success).toBe(true);
  });

  it("rejects editing another Profile's Account", () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    const otherProfile = createProfile(db, { name: "Partner" });
    const created = createAccountCore(db, {
      profileId: profile.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      accountType: "BANK",
    });
    if (!created.success) throw new Error("setup failed");

    const result = editAccountCore(db, {
      profileId: otherProfile.id,
      accountId: created.data.id,
      name: "Hijacked",
      classification: "ASSET",
      accountType: "BANK",
    });

    expect(result.success).toBe(false);
  });
});
