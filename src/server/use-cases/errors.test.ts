import { describe, expect, it } from "vitest";
import { TransactionValidationError } from "./errors";

describe("TransactionValidationError", () => {
  it("surfaces a specific message for MIXED_CURRENCY_UNSUPPORTED", () => {
    const error = new TransactionValidationError([{ code: "MIXED_CURRENCY_UNSUPPORTED" }]);
    expect(error.message).toMatch(/mixes more than one currency/i);
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
