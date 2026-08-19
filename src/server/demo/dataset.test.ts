import { describe, expect, it } from "vitest";
import { CLASSIFICATIONS, INSTRUMENT_TYPES } from "@/domain";
import { buildDemoDataset, validateDataset } from "./dataset";

describe("buildDemoDataset", () => {
  it("produces at least 1000 transactions covering roughly one year", () => {
    const now = new Date("2026-08-16T00:00:00.000Z");
    const dataset = buildDemoDataset(now);

    expect(dataset.transactions.length).toBeGreaterThanOrEqual(1000);

    const dates = dataset.transactions.map((t) => t.date).sort();
    const earliest = new Date(dates[0]);
    const latest = new Date(dates[dates.length - 1]);
    const spanDays = (latest.getTime() - earliest.getTime()) / 86400000;
    expect(spanDays).toBeGreaterThan(300);
    expect(spanDays).toBeLessThanOrEqual(366);
  });

  it("every generated transaction balances and satisfies ownership (rule #3)", () => {
    const dataset = buildDemoDataset(new Date("2026-08-16T00:00:00.000Z"));
    expect(() => validateDataset(dataset)).not.toThrow();
  });

  it("has exactly 2 Members, exactly one marked primary", () => {
    const dataset = buildDemoDataset();
    expect(dataset.members).toHaveLength(2);
    expect(dataset.members.filter((m) => m.isPrimary)).toHaveLength(1);
    expect(dataset.members.find((m) => m.id === dataset.primaryMemberId)?.isPrimary).toBe(true);
  });

  it("gives every Member their own INR Currency", () => {
    const dataset = buildDemoDataset();
    expect(dataset.currencies).toHaveLength(dataset.members.length);
    for (const currency of dataset.currencies) {
      expect(currency.code).toBe("INR");
      expect(dataset.members.some((m) => m.id === currency.memberId)).toBe(true);
    }
  });

  it("stays entirely within the frozen classification/instrument-type set (rule #11)", () => {
    const dataset = buildDemoDataset();
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
    const dataset = buildDemoDataset();
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

  it("includes activity for both Members", () => {
    const dataset = buildDemoDataset();
    const memberIdsWithTransactions = new Set(dataset.transactions.map((t) => t.memberId));
    expect(memberIdsWithTransactions.size).toBe(2);
  });

  it("includes at least some tagged transactions", () => {
    const dataset = buildDemoDataset();
    expect(dataset.transactions.some((t) => t.tags && t.tags.length > 0)).toBe(true);
  });

  it("is deterministic given the same date and seed", () => {
    const now = new Date("2026-08-16T00:00:00.000Z");
    const a = buildDemoDataset(now, 42);
    const b = buildDemoDataset(now, 42);
    expect(a.transactions.length).toBe(b.transactions.length);
    expect(a.transactions.map((t) => t.description)).toEqual(b.transactions.map((t) => t.description));
  });
});
