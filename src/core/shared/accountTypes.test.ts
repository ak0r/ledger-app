import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPES_BY_CLASSIFICATION,
  CLASSIFICATIONS,
  CREATABLE_CLASSIFICATIONS,
  toAccountIdentity,
} from "./accountTypes";

describe("CREATABLE_CLASSIFICATIONS", () => {
  it("excludes Balancing (system-managed, not a normal user-created classification)", () => {
    expect(CREATABLE_CLASSIFICATIONS).not.toContain("BALANCING");
  });

  it("includes every other classification", () => {
    expect([...CREATABLE_CLASSIFICATIONS].sort()).toEqual(
      CLASSIFICATIONS.filter((c) => c !== "BALANCING")
        .slice()
        .sort(),
    );
  });
});

describe("ACCOUNT_TYPES_BY_CLASSIFICATION", () => {
  it("has an entry for every Classification — Account Type is mandatory on all five now", () => {
    expect(Object.keys(ACCOUNT_TYPES_BY_CLASSIFICATION).sort()).toEqual([...CLASSIFICATIONS].sort());
  });

  it("every listed type is a real member of ACCOUNT_TYPES", () => {
    for (const types of Object.values(ACCOUNT_TYPES_BY_CLASSIFICATION)) {
      for (const type of types) {
        expect(ACCOUNT_TYPES).toContain(type);
      }
    }
  });

  it("Asset: Cash/Bank/Investments/Wallet/Receivables — no Instrument-backed types (Ledger/Portfolio delink)", () => {
    expect(ACCOUNT_TYPES_BY_CLASSIFICATION.ASSET).toEqual(["CASH", "BANK", "INVESTMENTS", "WALLET", "RECEIVABLES"]);
  });

  it("Liability: Credit Card/Loan/Payables", () => {
    expect(ACCOUNT_TYPES_BY_CLASSIFICATION.LIABILITY).toEqual(["CREDIT_CARD", "LOAN", "PAYABLES"]);
  });

  it("Income: Earned/Passive/Windfall", () => {
    expect(ACCOUNT_TYPES_BY_CLASSIFICATION.INCOME).toEqual(["EARNED", "PASSIVE", "WINDFALL"]);
  });

  it("Expense: Fixed/Variable/Discretionary/Financial", () => {
    expect(ACCOUNT_TYPES_BY_CLASSIFICATION.EXPENSE).toEqual(["FIXED", "VARIABLE", "DISCRETIONARY", "FINANCIAL"]);
  });

  it("Balancing: Initial only (never offered in the New Account form — rule #22)", () => {
    expect(ACCOUNT_TYPES_BY_CLASSIFICATION.BALANCING).toEqual(["INITIAL"]);
  });
});

describe("toAccountIdentity", () => {
  it("builds the lowercase colon-separated internal representation", () => {
    expect(toAccountIdentity({ classification: "ASSET", accountType: "BANK", name: "HDFC Bank" })).toBe(
      "asset:bank:hdfc_bank",
    );
  });

  it("slugifies non-alphanumeric characters in the name", () => {
    expect(toAccountIdentity({ classification: "LIABILITY", accountType: "CREDIT_CARD", name: "Scapia (Visa)" })).toBe(
      "liability:credit_card:scapia_visa",
    );
  });
});
