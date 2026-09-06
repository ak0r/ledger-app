import { describe, expect, it } from "vitest";
import {
  nextOccurrence,
  occurrencesInRange,
  validateRecurringRule,
  type RecurringRuleInput,
  type RecurringSchedule,
} from "./recurring";
import type { AccountRef } from "./transaction";

const PROFILE = "profile-1";
const OTHER_PROFILE = "profile-2";

function account(id: string, profileId = PROFILE): AccountRef {
  return { id, profileId, currencyCode: "INR", currencyScale: 2 };
}

const accounts = new Map<string, AccountRef>(
  [account("hdfc-bank"), account("home-loan-interest"), account("other-profile-bank", OTHER_PROFILE)].map((a) => [
    a.id,
    a,
  ]),
);

function baseInput(overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput {
  return {
    profileId: PROFILE,
    name: "Home Loan Interest",
    template: {
      fromAccountId: "hdfc-bank",
      toAccountId: "home-loan-interest",
      amountMinor: 697600,
      description: "Home Loan Interest",
    },
    schedule: {
      frequency: "MONTHLY",
      interval: 1,
      byMonthDay: 7,
      startDate: "2026-08-07",
    },
    ...overrides,
  };
}

describe("validateRecurringRule", () => {
  it("accepts a valid monthly rule", () => {
    expect(validateRecurringRule(baseInput(), accounts)).toEqual([]);
  });

  it("rejects same from/to account", () => {
    const violations = validateRecurringRule(
      baseInput({ template: { ...baseInput().template, toAccountId: "hdfc-bank" } }),
      accounts,
    );
    expect(violations).toContainEqual({ code: "SAME_ACCOUNT" });
  });

  it("rejects an account owned by another profile", () => {
    const violations = validateRecurringRule(
      baseInput({ template: { ...baseInput().template, toAccountId: "other-profile-bank" } }),
      accounts,
    );
    expect(violations).toContainEqual({ code: "OWNERSHIP_MISMATCH", accountId: "other-profile-bank" });
  });

  it("rejects a zero amount", () => {
    const violations = validateRecurringRule(
      baseInput({ template: { ...baseInput().template, amountMinor: 0 } }),
      accounts,
    );
    expect(violations).toContainEqual({ code: "INVALID_AMOUNT" });
  });

  it("requires byMonthDay for MONTHLY", () => {
    const violations = validateRecurringRule(
      baseInput({ schedule: { frequency: "MONTHLY", interval: 1, startDate: "2026-08-07" } }),
      accounts,
    );
    expect(violations).toContainEqual({ code: "BY_MONTH_DAY_REQUIRED" });
  });

  it("requires byWeekday for WEEKLY", () => {
    const violations = validateRecurringRule(
      baseInput({ schedule: { frequency: "WEEKLY", interval: 1, startDate: "2026-08-07" } }),
      accounts,
    );
    expect(violations).toContainEqual({ code: "BY_WEEKDAY_REQUIRED" });
  });

  it("rejects an end date before the start date", () => {
    const violations = validateRecurringRule(
      baseInput({
        schedule: { frequency: "MONTHLY", interval: 1, byMonthDay: 7, startDate: "2026-08-07", endDate: "2026-01-01" },
      }),
      accounts,
    );
    expect(violations).toContainEqual({ code: "END_BEFORE_START" });
  });
});

describe("nextOccurrence", () => {
  it("DAILY steps by interval days", () => {
    const schedule: RecurringSchedule = { frequency: "DAILY", interval: 3, startDate: "2026-08-01" };
    expect(nextOccurrence(schedule, new Date("2026-08-05T00:00:00Z"))).toBe("2026-08-07");
  });

  it("WEEKLY anchors to byWeekday even if startDate falls on a different day", () => {
    // 2026-08-07 is a Friday (5); byWeekday 1 = Monday.
    const schedule: RecurringSchedule = {
      frequency: "WEEKLY",
      interval: 2,
      byWeekday: 1,
      startDate: "2026-08-07",
    };
    expect(nextOccurrence(schedule, new Date("2026-08-01T00:00:00Z"))).toBe("2026-08-10");
    expect(nextOccurrence(schedule, new Date("2026-08-11T00:00:00Z"))).toBe("2026-08-24");
  });

  it("MONTHLY clamps byMonthDay to the shorter month instead of overflowing", () => {
    const schedule: RecurringSchedule = { frequency: "MONTHLY", interval: 1, byMonthDay: 31, startDate: "2026-01-31" };
    expect(nextOccurrence(schedule, new Date("2026-02-01T00:00:00Z"))).toBe("2026-02-28");
  });

  it("YEARLY clamps Feb 29 anchor to Feb 28 on a non-leap year", () => {
    const schedule: RecurringSchedule = { frequency: "YEARLY", interval: 1, startDate: "2024-02-29" };
    expect(nextOccurrence(schedule, new Date("2025-01-01T00:00:00Z"))).toBe("2025-02-28");
    expect(nextOccurrence(schedule, new Date("2028-01-01T00:00:00Z"))).toBe("2028-02-29");
  });

  it("never returns an occurrence before the rule's own startDate", () => {
    const schedule: RecurringSchedule = { frequency: "MONTHLY", interval: 1, byMonthDay: 7, startDate: "2026-08-15" };
    expect(nextOccurrence(schedule, new Date("2026-08-01T00:00:00Z"))).toBe("2026-09-07");
  });

  it("returns null once past the end date", () => {
    const schedule: RecurringSchedule = {
      frequency: "MONTHLY",
      interval: 1,
      byMonthDay: 7,
      startDate: "2026-08-07",
      endDate: "2026-09-07",
    };
    expect(nextOccurrence(schedule, new Date("2026-10-01T00:00:00Z"))).toBeNull();
  });
});

describe("occurrencesInRange", () => {
  it("lists every monthly occurrence within a range", () => {
    const schedule: RecurringSchedule = { frequency: "MONTHLY", interval: 1, byMonthDay: 7, startDate: "2026-01-07" };
    expect(occurrencesInRange(schedule, "2026-06-01", "2026-08-31")).toEqual([
      "2026-06-07",
      "2026-07-07",
      "2026-08-07",
    ]);
  });

  it("excludes occurrences past the schedule's end date", () => {
    const schedule: RecurringSchedule = {
      frequency: "MONTHLY",
      interval: 1,
      byMonthDay: 7,
      startDate: "2026-01-07",
      endDate: "2026-07-01",
    };
    expect(occurrencesInRange(schedule, "2026-06-01", "2026-08-31")).toEqual(["2026-06-07"]);
  });
});
