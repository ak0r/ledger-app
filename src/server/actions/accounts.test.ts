import { describe, expect, it } from "vitest";
import type { Db } from "../db/family-client";
import { createTestDb } from "../testing/createTestDb";
import { createMember } from "../use-cases/members";
import { createCurrency } from "../use-cases/currencies";
import { archiveAccountCore, createAccountCore, editAccountCore } from "./accounts.core";

function setUp(db: Db) {
  const member = createMember(db, { name: "Amit" });
  const currency = createCurrency(db, {
    memberId: member.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  return { member, currency };
}

describe("createAccountCore", () => {
  it("creates an Account for an existing Currency", () => {
    const db = createTestDb();
    const { member, currency } = setUp(db);

    const result = createAccountCore(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown classification enum value — fast client feedback", () => {
    const db = createTestDb();
    const { member, currency } = setUp(db);

    const result = createAccountCore(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "NOT_A_REAL_CLASSIFICATION",
      instrumentType: "BANK",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a Currency belonging to a different Member", () => {
    const db = createTestDb();
    const { currency } = setUp(db);
    const otherMember = createMember(db, { name: "Partner" });

    const result = createAccountCore(db, {
      memberId: otherMember.id,
      currencyId: currency.id,
      name: "Should fail",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(result.success).toBe(false);
  });
});

describe("archiveAccountCore", () => {
  it("archives an existing Account", () => {
    const db = createTestDb();
    const { member, currency } = setUp(db);
    const created = createAccountCore(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });
    if (!created.success) throw new Error("setup failed");

    const result = archiveAccountCore(db, {
      memberId: member.id,
      accountId: created.data.id,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isArchived).toBe(true);
  });
});

describe("editAccountCore", () => {
  it("updates an existing Account", () => {
    const db = createTestDb();
    const { member, currency } = setUp(db);
    const created = createAccountCore(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });
    if (!created.success) throw new Error("setup failed");

    const result = editAccountCore(db, {
      memberId: member.id,
      accountId: created.data.id,
      name: "HDFC Bank — Salary",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("HDFC Bank — Salary");
  });

  it("rejects editing another Member's Account", () => {
    const db = createTestDb();
    const { member, currency } = setUp(db);
    const otherMember = createMember(db, { name: "Partner" });
    const created = createAccountCore(db, {
      memberId: member.id,
      currencyId: currency.id,
      name: "HDFC Bank",
      classification: "ASSET",
      instrumentType: "BANK",
    });
    if (!created.success) throw new Error("setup failed");

    const result = editAccountCore(db, {
      memberId: otherMember.id,
      accountId: created.data.id,
      name: "Hijacked",
      classification: "ASSET",
      instrumentType: "BANK",
    });

    expect(result.success).toBe(false);
  });
});
