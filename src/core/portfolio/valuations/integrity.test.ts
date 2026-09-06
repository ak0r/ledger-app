import { describe, expect, it } from "vitest";
import { toQuantityMinorUnits } from "../../shared/quantity";
import { classifyHoldingIntegrity } from "./integrity";

describe("classifyHoldingIntegrity", () => {
  it("is VERIFIED when the transaction-implied and observed units match exactly", () => {
    expect(classifyHoldingIntegrity(toQuantityMinorUnits(100), toQuantityMinorUnits(100))).toBe("VERIFIED");
  });

  it("is VERIFIED within a small rounding tolerance", () => {
    expect(classifyHoldingIntegrity(toQuantityMinorUnits(100), toQuantityMinorUnits(100.00005))).toBe("VERIFIED");
  });

  it("is SNAPSHOT_ONLY when the transaction history clearly doesn't cover the observed position", () => {
    // Statement's observed balance is 150 units but transactions only imply 100 —
    // 50 units of history are missing (e.g. the CAS only covered a partial period).
    expect(classifyHoldingIntegrity(toQuantityMinorUnits(100), toQuantityMinorUnits(150))).toBe("SNAPSHOT_ONLY");
  });
});
