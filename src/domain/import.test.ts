import { describe, expect, it } from "vitest";
import { resolveUnknownCounterAccount } from "./import";

describe("resolveUnknownCounterAccount", () => {
  it("maps a debit against the known account to Expense:Unknown", () => {
    expect(resolveUnknownCounterAccount("debit")).toEqual({
      classification: "EXPENSE",
      name: "Unknown",
    });
  });

  it("maps a credit against the known account to Income:Unknown", () => {
    expect(resolveUnknownCounterAccount("credit")).toEqual({
      classification: "INCOME",
      name: "Unknown",
    });
  });
});
