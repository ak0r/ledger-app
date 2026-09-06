import { describe, expect, it } from "vitest";
import { toQuantityMinorUnits } from "../../shared/quantity";
import { netUnitsFromTransactions, validateInvestmentTransaction } from "./investmentTransaction";

describe("validateInvestmentTransaction", () => {
  it("accepts units x price == amount", () => {
    const violations = validateInvestmentTransaction(
      { type: "BUY", units: toQuantityMinorUnits(100), price: 50, amount: 500000 },
      2,
    );
    expect(violations).toEqual([]);
  });

  it("rejects a mismatched amount", () => {
    const violations = validateInvestmentTransaction(
      { type: "BUY", units: toQuantityMinorUnits(100), price: 50, amount: 600000 },
      2,
    );
    expect(violations).toContainEqual({ code: "AMOUNT_MISMATCH" });
  });

  it("exempts DIVIDEND entirely — a cash-only event with no unit/price component", () => {
    const violations = validateInvestmentTransaction(
      { type: "DIVIDEND", units: 0, price: 0, amount: 12345 },
      2,
    );
    expect(violations).toEqual([]);
  });

  it("rejects non-positive units and price", () => {
    const violations = validateInvestmentTransaction(
      { type: "BUY", units: 0, price: 0, amount: 0 },
      2,
    );
    expect(violations).toContainEqual({ code: "NON_POSITIVE_UNITS" });
    expect(violations).toContainEqual({ code: "NON_POSITIVE_PRICE" });
  });
});

describe("netUnitsFromTransactions", () => {
  it("adds BUY/BONUS/TRANSFER_IN, subtracts SELL/TRANSFER_OUT, ignores DIVIDEND", () => {
    const units = netUnitsFromTransactions([
      { type: "BUY", units: 100 },
      { type: "BONUS", units: 10 },
      { type: "TRANSFER_IN", units: 5 },
      { type: "SELL", units: 30 },
      { type: "TRANSFER_OUT", units: 5 },
      { type: "DIVIDEND", units: 0 },
    ]);
    expect(units).toBe(100 + 10 + 5 - 30 - 5);
  });

  it("returns 0 for no transactions", () => {
    expect(netUnitsFromTransactions([])).toBe(0);
  });
});
