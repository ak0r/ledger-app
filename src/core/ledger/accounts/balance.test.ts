import { describe, expect, it } from "vitest";
import { accountBalance, isDebitNormal } from "./balance";

describe("isDebitNormal", () => {
  it("is true for ASSET and EXPENSE", () => {
    expect(isDebitNormal("ASSET")).toBe(true);
    expect(isDebitNormal("EXPENSE")).toBe(true);
  });

  it("is false for LIABILITY, INCOME, BALANCING", () => {
    expect(isDebitNormal("LIABILITY")).toBe(false);
    expect(isDebitNormal("INCOME")).toBe(false);
    expect(isDebitNormal("BALANCING")).toBe(false);
  });
});

describe("accountBalance", () => {
  it("is debit-normal for ASSET", () => {
    expect(accountBalance("ASSET", 100000, 20000)).toBe(80000);
  });

  it("is debit-normal for EXPENSE", () => {
    expect(accountBalance("EXPENSE", 5000, 0)).toBe(5000);
  });

  it("is credit-normal for LIABILITY (e.g. a credit card balance owed)", () => {
    expect(accountBalance("LIABILITY", 2000, 5000)).toBe(3000);
  });

  it("is credit-normal for INCOME", () => {
    expect(accountBalance("INCOME", 0, 100000)).toBe(100000);
  });

  it("is credit-normal for BALANCING (opening balance account)", () => {
    expect(accountBalance("BALANCING", 0, 250000)).toBe(250000);
  });

  it("is zero for an account with no postings", () => {
    expect(accountBalance("ASSET", 0, 0)).toBe(0);
  });
});
