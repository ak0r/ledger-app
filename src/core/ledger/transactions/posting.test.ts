import { describe, expect, it } from "vitest";
import { validatePosting } from "./posting";

describe("validatePosting", () => {
  it("accepts debit only", () => {
    expect(
      validatePosting({ accountId: "a", debit: 5000, credit: 0, quantity: 5000000, price: 1 }),
    ).toEqual([]);
  });

  it("accepts credit only", () => {
    expect(
      validatePosting({ accountId: "a", debit: 0, credit: 5000, quantity: 5000000, price: 1 }),
    ).toEqual([]);
  });

  it("rejects both zero", () => {
    const violations = validatePosting({
      accountId: "a",
      debit: 0,
      credit: 0,
      quantity: 5000000,
      price: 1,
    });
    expect(violations).toContainEqual({ code: "NOT_EXACTLY_ONE_SIDE", accountId: "a" });
  });

  it("rejects both positive", () => {
    const violations = validatePosting({
      accountId: "a",
      debit: 5000,
      credit: 5000,
      quantity: 5000000,
      price: 1,
    });
    expect(violations).toContainEqual({ code: "NOT_EXACTLY_ONE_SIDE", accountId: "a" });
  });

  it("rejects negative amounts", () => {
    const violations = validatePosting({
      accountId: "a",
      debit: -100,
      credit: 0,
      quantity: 5000000,
      price: 1,
    });
    expect(violations).toContainEqual({ code: "NEGATIVE_AMOUNT", accountId: "a" });
  });

  it("rejects fractional amounts (money is integer minor units)", () => {
    const violations = validatePosting({
      accountId: "a",
      debit: 50.5,
      credit: 0,
      quantity: 5000000,
      price: 1,
    });
    expect(violations).toContainEqual({ code: "NEGATIVE_AMOUNT", accountId: "a" });
  });

  it("rejects non-integer quantity", () => {
    const violations = validatePosting({
      accountId: "a",
      debit: 5000,
      credit: 0,
      quantity: 5000.5,
      price: 1,
    });
    expect(violations).toContainEqual({ code: "INVALID_QUANTITY", accountId: "a" });
  });

  it("rejects zero/negative quantity", () => {
    const violations = validatePosting({
      accountId: "a",
      debit: 5000,
      credit: 0,
      quantity: 0,
      price: 1,
    });
    expect(violations).toContainEqual({ code: "INVALID_QUANTITY", accountId: "a" });
  });

  it("rejects zero/negative price", () => {
    const violations = validatePosting({
      accountId: "a",
      debit: 5000,
      credit: 0,
      quantity: 5000000,
      price: 0,
    });
    expect(violations).toContainEqual({ code: "INVALID_PRICE", accountId: "a" });
  });

  it("rejects non-finite price", () => {
    const violations = validatePosting({
      accountId: "a",
      debit: 5000,
      credit: 0,
      quantity: 5000000,
      price: Number.POSITIVE_INFINITY,
    });
    expect(violations).toContainEqual({ code: "INVALID_PRICE", accountId: "a" });
  });
});
