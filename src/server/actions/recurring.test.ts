import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "../services/profiles";
import { createCurrency } from "../services/currencies";
import { createAccount } from "../services/accounts";
import { createRecurringRuleCore, deleteRecurringRuleCore, editRecurringRuleCore } from "./recurring.core";

function setUp(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const fromAccount = createAccount(db, {
    profileId: profile.id,
    currencyId: currency.id,
    name: "HDFC Bank",
    classification: "ASSET",
    instrumentType: "BANK",
  });
  const toAccount = createAccount(db, {
    profileId: profile.id,
    currencyId: currency.id,
    name: "Home Loan Interest",
    classification: "EXPENSE",
    instrumentType: "EXPENSE",
  });
  return { profile, fromAccount, toAccount };
}

function baseInput(fromAccountId: string, toAccountId: string, profileId: string) {
  return {
    profileId,
    name: "Home Loan Interest",
    fromAccountId,
    toAccountId,
    amountMinor: 697600,
    description: "Home Loan Interest",
    schedule: { frequency: "MONTHLY", interval: 1, byMonthDay: 7, startDate: "2026-08-07" },
  };
}

describe("createRecurringRuleCore", () => {
  it("creates a recurring rule", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);

    const result = createRecurringRuleCore(db, baseInput(fromAccount.id, toAccount.id, profile.id));

    expect(result.success).toBe(true);
  });

  it("rejects a MONTHLY schedule missing byMonthDay — fast client feedback", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);

    const result = createRecurringRuleCore(db, {
      ...baseInput(fromAccount.id, toAccount.id, profile.id),
      schedule: { frequency: "MONTHLY", interval: 1, startDate: "2026-08-07" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a zero amount", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);

    const result = createRecurringRuleCore(db, {
      ...baseInput(fromAccount.id, toAccount.id, profile.id),
      amountMinor: 0,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an account belonging to a different Profile", () => {
    const db = createTestDb();
    const { fromAccount, toAccount } = setUp(db);
    const otherProfile = createProfile(db, { name: "Partner" });

    const result = createRecurringRuleCore(db, baseInput(fromAccount.id, toAccount.id, otherProfile.id));

    expect(result.success).toBe(false);
  });
});

describe("editRecurringRuleCore", () => {
  it("updates an existing rule", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);
    const created = createRecurringRuleCore(db, baseInput(fromAccount.id, toAccount.id, profile.id));
    if (!created.success) throw new Error("setup failed");

    const result = editRecurringRuleCore(db, {
      ...baseInput(fromAccount.id, toAccount.id, profile.id),
      recurringRuleId: created.data.id,
      amountMinor: 700000,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amountMinor).toBe(700000);
  });

  it("rejects editing another Profile's rule", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);
    const otherProfile = createProfile(db, { name: "Partner" });
    const created = createRecurringRuleCore(db, baseInput(fromAccount.id, toAccount.id, profile.id));
    if (!created.success) throw new Error("setup failed");

    const result = editRecurringRuleCore(db, {
      ...baseInput(fromAccount.id, toAccount.id, otherProfile.id),
      recurringRuleId: created.data.id,
    });

    expect(result.success).toBe(false);
  });
});

describe("deleteRecurringRuleCore", () => {
  it("deletes an existing rule", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);
    const created = createRecurringRuleCore(db, baseInput(fromAccount.id, toAccount.id, profile.id));
    if (!created.success) throw new Error("setup failed");

    const result = deleteRecurringRuleCore(db, { profileId: profile.id, recurringRuleId: created.data.id });

    expect(result.success).toBe(true);
  });
});
