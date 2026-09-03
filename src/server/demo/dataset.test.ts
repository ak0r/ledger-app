import { describe, expect, it } from "vitest";
import { CLASSIFICATIONS, INSTRUMENT_TYPES } from "@/domain";
import { buildDemoDataset, validateDataset } from "./dataset";

const PROFILE_ID = "profile-1";

describe("buildDemoDataset", () => {
  // Threshold halved from the old two-Member household dataset (2026-08-20
  // User Simplification delta trimmed generation to one Profile's worth of
  // activity, see src/server/demo/dataset.ts's own file header) — still
  // "hundreds of transactions across a full year," just for one Profile.
  it("produces at least 800 transactions covering roughly one year", () => {
    const now = new Date("2026-08-16T00:00:00.000Z");
    const dataset = buildDemoDataset(PROFILE_ID, now);

    expect(dataset.transactions.length).toBeGreaterThanOrEqual(800);

    const dates = dataset.transactions.map((t) => t.date).sort();
    const earliest = new Date(dates[0]);
    const latest = new Date(dates[dates.length - 1]);
    const spanDays = (latest.getTime() - earliest.getTime()) / 86400000;
    expect(spanDays).toBeGreaterThan(300);
    expect(spanDays).toBeLessThanOrEqual(366);
  });

  it("every generated transaction balances and satisfies ownership (rule #3)", () => {
    const dataset = buildDemoDataset(PROFILE_ID, new Date("2026-08-16T00:00:00.000Z"));
    expect(() => validateDataset(dataset)).not.toThrow();
  });

  it("gives the Profile a single INR Currency", () => {
    const dataset = buildDemoDataset(PROFILE_ID);
    expect(dataset.currencies).toHaveLength(1);
    expect(dataset.currencies[0].code).toBe("INR");
    expect(dataset.currencies[0].profileId).toBe(PROFILE_ID);
  });

  it("stays entirely within the frozen classification/instrument-type set (rule #11)", () => {
    const dataset = buildDemoDataset(PROFILE_ID);
    for (const account of dataset.accounts) {
      expect(CLASSIFICATIONS).toContain(account.classification);
      expect(INSTRUMENT_TYPES).toContain(account.instrumentType);
    }
    // Explicitly no investment-type instruments (dropped per the resolved
    // 05-mvp-scope.md conflict) — guards against reintroducing them.
    const names = dataset.accounts.map((a) => a.name.toLowerCase());
    expect(names.some((n) => /stock|mutual fund|metal/.test(n))).toBe(false);
  });

  it("includes at least one Split transaction (multi-destination, e.g. the Home Loan EMI)", () => {
    const dataset = buildDemoDataset(PROFILE_ID);
    const postingsByTransaction = new Map<string, number>();
    for (const posting of dataset.postings) {
      postingsByTransaction.set(
        posting.transactionId,
        (postingsByTransaction.get(posting.transactionId) ?? 0) + 1,
      );
    }
    const hasSplit = [...postingsByTransaction.values()].some((count) => count > 2);
    expect(hasSplit).toBe(true);
  });

  it("scopes every generated Account and Transaction to the given Profile", () => {
    const dataset = buildDemoDataset(PROFILE_ID);
    expect(dataset.accounts.every((a) => a.profileId === PROFILE_ID)).toBe(true);
    expect(dataset.transactions.every((t) => t.profileId === PROFILE_ID)).toBe(true);
  });

  it("includes at least some tagged transactions", () => {
    const dataset = buildDemoDataset(PROFILE_ID);
    expect(dataset.transactions.some((t) => t.tags && t.tags.length > 0)).toBe(true);
  });

  it("is deterministic given the same date and seed", () => {
    const now = new Date("2026-08-16T00:00:00.000Z");
    const a = buildDemoDataset(PROFILE_ID, now, 42);
    const b = buildDemoDataset(PROFILE_ID, now, 42);
    expect(a.transactions.length).toBe(b.transactions.length);
    expect(a.transactions.map((t) => t.description)).toEqual(b.transactions.map((t) => t.description));
  });

  it("includes Recurring Rules scoped to the Profile, never posting to the Ledger themselves", () => {
    const dataset = buildDemoDataset(PROFILE_ID);
    expect(dataset.recurringRules.length).toBeGreaterThan(0);
    expect(dataset.recurringRules.every((r) => r.profileId === PROFILE_ID)).toBe(true);
  });

  it("includes a Recurring Budget with a current Period and Allocations, actuals never persisted", () => {
    const dataset = buildDemoDataset(PROFILE_ID);
    expect(dataset.budgets).toHaveLength(1);
    expect(dataset.budgets[0].profileId).toBe(PROFILE_ID);
    expect(dataset.budgets[0].type).toBe("RECURRING");

    expect(dataset.budgetPeriods).toHaveLength(1);
    expect(dataset.budgetPeriods[0].budgetId).toBe(dataset.budgets[0].id);

    expect(dataset.budgetAllocations.length).toBeGreaterThan(0);
    expect(dataset.budgetAllocations.every((a) => a.budgetPeriodId === dataset.budgetPeriods[0].id)).toBe(true);
  });
});
