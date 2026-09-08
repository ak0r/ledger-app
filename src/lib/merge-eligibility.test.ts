import { describe, expect, it } from "vitest";
import {
  checkMergeEligibility,
  type MergeCandidateAccount,
  type MergeCandidateTransaction,
} from "./merge-eligibility";

function account(currencyId: string): MergeCandidateAccount {
  return { currencyId };
}

function transaction(
  id: string,
  date: string,
  postings: { accountId: string; debit: number; credit: number }[],
): MergeCandidateTransaction {
  return {
    id,
    date,
    postings: postings.map((posting) => ({
      accountId: posting.accountId,
      units: posting.debit - posting.credit,
    })),
  };
}

const inr = "currency-inr";
const usd = "currency-usd";
const accountsById = new Map<string, MergeCandidateAccount>([
  ["bank", account(inr)],
  ["credit-card", account(inr)],
  ["food", account(inr)],
  ["shopping", account(inr)],
  ["foreign-bank", account(usd)],
]);

describe("checkMergeEligibility", () => {
  it("rejects fewer than two transactions", () => {
    const single = [transaction("t1", "2026-08-15", [{ accountId: "bank", debit: 0, credit: 1000 }])];
    expect(checkMergeEligibility(single, accountsById)).toEqual({
      eligible: false,
      reason: expect.stringContaining("at least two"),
    });
  });

  it("rejects transactions on different dates", () => {
    const t1 = transaction("t1", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 1000 },
      { accountId: "food", debit: 1000, credit: 0 },
    ]);
    const t2 = transaction("t2", "2026-08-16", [
      { accountId: "bank", debit: 0, credit: 2000 },
      { accountId: "food", debit: 2000, credit: 0 },
    ]);
    expect(checkMergeEligibility([t1, t2], accountsById)).toEqual({
      eligible: false,
      reason: expect.stringContaining("same date"),
    });
  });

  it("rejects transactions spanning different currencies", () => {
    const t1 = transaction("t1", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 1000 },
      { accountId: "food", debit: 1000, credit: 0 },
    ]);
    const t2 = transaction("t2", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 2000 },
      { accountId: "foreign-bank", debit: 2000, credit: 0 },
    ]);
    expect(checkMergeEligibility([t1, t2], accountsById)).toEqual({
      eligible: false,
      reason: expect.stringContaining("same currency"),
    });
  });

  it("rejects transactions with neither a common From nor common To account", () => {
    const t1 = transaction("t1", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 1000 },
      { accountId: "food", debit: 1000, credit: 0 },
    ]);
    const t2 = transaction("t2", "2026-08-15", [
      { accountId: "credit-card", debit: 0, credit: 2000 },
      { accountId: "shopping", debit: 2000, credit: 0 },
    ]);
    expect(checkMergeEligibility([t1, t2], accountsById)).toEqual({
      eligible: false,
      reason: expect.stringContaining("common"),
    });
  });

  it("accepts transactions sharing a common From account", () => {
    const t1 = transaction("t1", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 1000 },
      { accountId: "food", debit: 1000, credit: 0 },
    ]);
    const t2 = transaction("t2", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 2000 },
      { accountId: "shopping", debit: 2000, credit: 0 },
    ]);
    expect(checkMergeEligibility([t1, t2], accountsById)).toEqual({ eligible: true });
  });

  it("accepts transactions sharing a common To account", () => {
    const t1 = transaction("t1", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 1000 },
      { accountId: "food", debit: 1000, credit: 0 },
    ]);
    const t2 = transaction("t2", "2026-08-15", [
      { accountId: "credit-card", debit: 0, credit: 2000 },
      { accountId: "food", debit: 2000, credit: 0 },
    ]);
    expect(checkMergeEligibility([t1, t2], accountsById)).toEqual({ eligible: true });
  });

  it("accepts three transactions sharing a common From account", () => {
    const t1 = transaction("t1", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 1000 },
      { accountId: "food", debit: 1000, credit: 0 },
    ]);
    const t2 = transaction("t2", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 2000 },
      { accountId: "shopping", debit: 2000, credit: 0 },
    ]);
    const t3 = transaction("t3", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 500 },
      { accountId: "food", debit: 500, credit: 0 },
    ]);
    expect(checkMergeEligibility([t1, t2, t3], accountsById)).toEqual({ eligible: true });
  });

  it("rejects when an account can't be found (defensive)", () => {
    const t1 = transaction("t1", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 1000 },
      { accountId: "unknown-account", debit: 1000, credit: 0 },
    ]);
    const t2 = transaction("t2", "2026-08-15", [
      { accountId: "bank", debit: 0, credit: 2000 },
      { accountId: "food", debit: 2000, credit: 0 },
    ]);
    expect(checkMergeEligibility([t1, t2], accountsById)).toEqual({
      eligible: false,
      reason: expect.stringContaining("could not be found"),
    });
  });
});
