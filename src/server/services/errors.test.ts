import { describe, expect, it } from "vitest";
import { TransactionValidationError } from "./errors";

describe("TransactionValidationError", () => {
  it("surfaces a specific message for PRICE_MUST_BE_ONE", () => {
    const error = new TransactionValidationError([{ code: "PRICE_MUST_BE_ONE", accountId: "a" }]);
    expect(error.message).toMatch(/invalid price/i);
  });

  it("surfaces a specific message for UNBALANCED", () => {
    const error = new TransactionValidationError([
      { code: "UNBALANCED", totalDebit: 100, totalCredit: 50 },
    ]);
    expect(error.message).toMatch(/don't balance/i);
  });

  it("falls back to a generic message when there are no violations", () => {
    const error = new TransactionValidationError([]);
    expect(error.message).toBe("Transaction failed domain validation");
  });

  it("keeps the full violations list attached, not just the first", () => {
    const violations = [{ code: "TOO_FEW_POSTINGS" as const }, { code: "UNBALANCED" as const, totalDebit: 1, totalCredit: 2 }];
    const error = new TransactionValidationError(violations);
    expect(error.violations).toEqual(violations);
  });
});
