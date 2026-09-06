import { describe, expect, it } from "vitest";
import type { Db } from "../persistence/client";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createAccount } from "./accounts";
import {
  createRecurringRule,
  deleteRecurringRule,
  editRecurringRule,
  getRecurringRule,
  listRecurringRules,
  listRecurringRulesWithNextDue,
} from "./recurring";
import { NotFoundError, RecurringRuleValidationError } from "./errors";

function setUp(db: Db) {
  const profile = createProfile(db, { name: "Amit" });
  const otherProfile = createProfile(db, { name: "Other" });
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
  return { profile, otherProfile, fromAccount, toAccount };
}

function baseInput(fromAccountId: string, toAccountId: string, profileId: string) {
  return {
    profileId,
    name: "Home Loan Interest",
    fromAccountId,
    toAccountId,
    amountMinor: 697600,
    description: "Home Loan Interest",
    schedule: {
      frequency: "MONTHLY" as const,
      interval: 1,
      byMonthDay: 7,
      startDate: "2026-08-07",
    },
  };
}

describe("createRecurringRule", () => {
  it("persists a recurring rule", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);

    const rule = createRecurringRule(db, baseInput(fromAccount.id, toAccount.id, profile.id));

    expect(rule.name).toBe("Home Loan Interest");
    expect(rule.frequency).toBe("MONTHLY");
    expect(rule.byMonthDay).toBe(7);
  });

  it("rejects an account belonging to another profile (rule #6)", () => {
    const db = createTestDb();
    const { otherProfile, fromAccount, toAccount } = setUp(db);

    expect(() => createRecurringRule(db, baseInput(fromAccount.id, toAccount.id, otherProfile.id))).toThrow(
      RecurringRuleValidationError,
    );
  });

  it("rejects an invalid schedule (missing byMonthDay)", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);
    const input = baseInput(fromAccount.id, toAccount.id, profile.id);

    expect(() =>
      createRecurringRule(db, {
        ...input,
        schedule: { frequency: "MONTHLY", interval: 1, startDate: "2026-08-07" },
      }),
    ).toThrow(RecurringRuleValidationError);
  });
});

describe("editRecurringRule", () => {
  it("updates fields in place", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);
    const rule = createRecurringRule(db, baseInput(fromAccount.id, toAccount.id, profile.id));

    const edited = editRecurringRule(db, {
      ...baseInput(fromAccount.id, toAccount.id, profile.id),
      recurringRuleId: rule.id,
      amountMinor: 700000,
    });

    expect(edited.amountMinor).toBe(700000);
    expect(getRecurringRule(db, rule.id, profile.id)?.amountMinor).toBe(700000);
  });

  it("throws NotFoundError for a rule outside the profile", () => {
    const db = createTestDb();
    const { profile, otherProfile, fromAccount, toAccount } = setUp(db);
    const rule = createRecurringRule(db, baseInput(fromAccount.id, toAccount.id, profile.id));

    expect(() =>
      editRecurringRule(db, {
        ...baseInput(fromAccount.id, toAccount.id, otherProfile.id),
        recurringRuleId: rule.id,
      }),
    ).toThrow(NotFoundError);
  });
});

describe("deleteRecurringRule", () => {
  it("removes the rule", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);
    const rule = createRecurringRule(db, baseInput(fromAccount.id, toAccount.id, profile.id));

    deleteRecurringRule(db, { recurringRuleId: rule.id, profileId: profile.id });

    expect(getRecurringRule(db, rule.id, profile.id)).toBeUndefined();
  });

  it("throws NotFoundError for an already-deleted rule", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);
    const rule = createRecurringRule(db, baseInput(fromAccount.id, toAccount.id, profile.id));
    deleteRecurringRule(db, { recurringRuleId: rule.id, profileId: profile.id });

    expect(() => deleteRecurringRule(db, { recurringRuleId: rule.id, profileId: profile.id })).toThrow(
      NotFoundError,
    );
  });
});

describe("listRecurringRulesWithNextDue", () => {
  it("derives nextDue without persisting it", () => {
    const db = createTestDb();
    const { profile, fromAccount, toAccount } = setUp(db);
    createRecurringRule(db, baseInput(fromAccount.id, toAccount.id, profile.id));

    const rules = listRecurringRulesWithNextDue(db, profile.id, new Date("2026-08-01T00:00:00Z"));

    expect(rules).toHaveLength(1);
    expect(rules[0].nextDue).toBe("2026-08-07");
    expect(listRecurringRules(db, profile.id)[0]).not.toHaveProperty("nextDue");
  });
});
