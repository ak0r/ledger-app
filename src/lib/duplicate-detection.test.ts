import { describe, expect, it } from "vitest";
import { findPossibleDuplicates, type DuplicateCandidateRow } from "./duplicate-detection";

function row(overrides: Partial<DuplicateCandidateRow> & Pick<DuplicateCandidateRow, "id" | "sourceKey">): DuplicateCandidateRow {
  return {
    date: "2026-09-01",
    amountMinor: 150000,
    direction: "debit",
    accountId: "acct-axis",
    ...overrides,
  };
}

describe("findPossibleDuplicates", () => {
  it("flags a same-source-of-truth payment seen from a wallet export and a bank statement, by exact reference (UTR)", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", reference: "621319236710" }),
      row({ id: "axis-1", sourceKey: "file-axis", reference: "621319236710" }),
    ];
    const matches = findPossibleDuplicates(rows);
    expect(matches).toEqual(
      expect.arrayContaining([
        { id: "gpay-1", matchedId: "axis-1", reason: "reference" },
        { id: "axis-1", matchedId: "gpay-1", reason: "reference" },
      ]),
    );
  });

  it("falls back to date + amount + direction + account when neither row has a reference", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay" }),
      row({ id: "axis-1", sourceKey: "file-axis" }),
    ];
    const matches = findPossibleDuplicates(rows);
    expect(matches).toContainEqual({ id: "gpay-1", matchedId: "axis-1", reason: "heuristic" });
  });

  it("never flags two rows from the same source against each other", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay" }),
      row({ id: "gpay-2", sourceKey: "file-gpay" }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it("never flags a row that hasn't resolved to a real account yet", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", accountId: null }),
      row({ id: "axis-1", sourceKey: "file-axis" }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it("never flags rows resolved to different accounts, even with a matching reference", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", accountId: "acct-axis", reference: "621319236710" }),
      row({ id: "axis-1", sourceKey: "file-axis", accountId: "acct-hdfc", reference: "621319236710" }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it("never flags rows with opposite directions (an inflow can't duplicate an outflow)", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", direction: "debit" }),
      row({ id: "axis-1", sourceKey: "file-axis", direction: "credit" }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it("does not flag two genuinely different same-day, same-amount, same-account rows once each has its own distinct reference", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", reference: "111111111111" }),
      row({ id: "axis-1", sourceKey: "file-axis", reference: "222222222222" }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it("prefers an exact reference match over a coincidental heuristic one when both are available for the same row", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", reference: "621319236710" }),
      // Same date/amount/account as gpay-1 (would heuristically match too)
      // but a different reference — genuinely a different payment.
      row({ id: "axis-wrong", sourceKey: "file-axis", reference: "999999999999" }),
      row({ id: "axis-right", sourceKey: "file-axis-2", reference: "621319236710" }),
    ];
    const matches = findPossibleDuplicates(rows);
    expect(matches).toContainEqual({ id: "gpay-1", matchedId: "axis-right", reason: "reference" });
    expect(matches.find((m) => m.id === "gpay-1")?.matchedId).not.toBe("axis-wrong");
  });

  it("flags a heuristic match when time is within the tolerance window (real clock drift between a wallet app and bank settlement)", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", time: "10:51" }),
      row({ id: "axis-1", sourceKey: "file-axis", time: "11:15" }), // 24 minutes later
    ];
    expect(findPossibleDuplicates(rows)).toContainEqual({ id: "gpay-1", matchedId: "axis-1", reason: "heuristic" });
  });

  it("does not flag a heuristic match when time is outside the tolerance window, even with same date/amount/account", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", time: "10:00" }),
      row({ id: "axis-1", sourceKey: "file-axis", time: "13:00" }), // 3 hours later
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it("never requires a time match when one side has no time-of-day (a typical bank statement)", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", time: "23:59" }),
      row({ id: "axis-1", sourceKey: "file-axis" }), // no time field at all
    ];
    expect(findPossibleDuplicates(rows)).toContainEqual({ id: "gpay-1", matchedId: "axis-1", reason: "heuristic" });
  });

  it("flags a heuristic match on a shared counterparty token despite very different-looking names (nickname vs. full legal name)", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", counterparty: "Poonam Kulkarni" }),
      row({ id: "axis-1", sourceKey: "file-axis", counterparty: "POONAM AMIT KULKARNI" }),
    ];
    expect(findPossibleDuplicates(rows)).toContainEqual({ id: "gpay-1", matchedId: "axis-1", reason: "heuristic" });
  });

  it("does not flag a heuristic match when both sides have a counterparty and share no token", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay", counterparty: "Sanika Konde" }),
      row({ id: "axis-1", sourceKey: "file-axis", counterparty: "Subash Rokaya" }),
    ];
    expect(findPossibleDuplicates(rows)).toEqual([]);
  });

  it("never requires a counterparty match when one side has none (a self-transfer, ATM withdrawal, or bank charge)", () => {
    const rows = [
      row({ id: "gpay-1", sourceKey: "file-gpay" }), // "Top-up to UPI Lite" has no real counterparty
      row({ id: "axis-1", sourceKey: "file-axis", counterparty: "AMIT SHRI" }),
    ];
    expect(findPossibleDuplicates(rows)).toContainEqual({ id: "gpay-1", matchedId: "axis-1", reason: "heuristic" });
  });
});
