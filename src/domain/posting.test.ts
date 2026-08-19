import { describe, expect, it } from "vitest";
import { validatePosting } from "./posting";

describe("validatePosting", () => {
  it("accepts debit only", () => {
    expect(validatePosting({ accountId: "a", debit: 5000, credit: 0 })).toEqual([]);
  });

  it("accepts credit only", () => {
    expect(validatePosting({ accountId: "a", debit: 0, credit: 5000 })).toEqual([]);
  });

  it("rejects both zero", () => {
    const violations = validatePosting({ accountId: "a", debit: 0, credit: 0 });
    expect(violations).toContainEqual({ code: "NOT_EXACTLY_ONE_SIDE", accountId: "a" });
  });

  it("rejects both positive", () => {
    const violations = validatePosting({ accountId: "a", debit: 5000, credit: 5000 });
    expect(violations).toContainEqual({ code: "NOT_EXACTLY_ONE_SIDE", accountId: "a" });
  });

  it("rejects negative amounts", () => {
    const violations = validatePosting({ accountId: "a", debit: -100, credit: 0 });
    expect(violations).toContainEqual({ code: "NEGATIVE_AMOUNT", accountId: "a" });
  });

  it("rejects fractional amounts (money is integer minor units)", () => {
    const violations = validatePosting({ accountId: "a", debit: 50.5, credit: 0 });
    expect(violations).toContainEqual({ code: "NEGATIVE_AMOUNT", accountId: "a" });
  });
});
