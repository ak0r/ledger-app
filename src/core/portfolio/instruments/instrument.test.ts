import { describe, expect, it } from "vitest";
import { INSTRUMENT_BACKED_TYPES } from "./instrument";

describe("INSTRUMENT_BACKED_TYPES", () => {
  it("is MUTUAL_FUND, STOCK, COMMODITY — independent of core/ledger's account types", () => {
    expect(INSTRUMENT_BACKED_TYPES).toEqual(["MUTUAL_FUND", "STOCK", "COMMODITY"]);
  });
});
