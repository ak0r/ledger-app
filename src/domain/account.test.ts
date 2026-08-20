import { describe, expect, it } from "vitest";
import {
  CLASSIFICATIONS,
  CREATABLE_CLASSIFICATIONS,
  INSTRUMENT_TYPES,
  TYPES_BY_CLASSIFICATION,
} from "./account";

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

describe("TYPES_BY_CLASSIFICATION", () => {
  it("has entries for exactly Asset and Liability — the only classifications with a real Type layer", () => {
    expect(Object.keys(TYPES_BY_CLASSIFICATION).sort()).toEqual(["ASSET", "LIABILITY"]);
  });

  it("Income/Expense/Balancing are absent — that absence is the 'no Type step' signal", () => {
    expect(TYPES_BY_CLASSIFICATION.INCOME).toBeUndefined();
    expect(TYPES_BY_CLASSIFICATION.EXPENSE).toBeUndefined();
    expect(TYPES_BY_CLASSIFICATION.BALANCING).toBeUndefined();
  });

  it("every listed type is a real member of INSTRUMENT_TYPES", () => {
    for (const types of Object.values(TYPES_BY_CLASSIFICATION)) {
      for (const type of types ?? []) {
        expect(INSTRUMENT_TYPES).toContain(type);
      }
    }
  });

  it("Asset includes the three new market-valued-capability types", () => {
    expect(TYPES_BY_CLASSIFICATION.ASSET).toEqual(
      expect.arrayContaining(["MUTUAL_FUND", "STOCK", "COMMODITY"]),
    );
  });

  it("Liability is unchanged (Credit Card, Loan only)", () => {
    expect(TYPES_BY_CLASSIFICATION.LIABILITY).toEqual(["CREDIT_CARD", "LOAN"]);
  });
});
