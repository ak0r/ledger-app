import { describe, expect, it } from "vitest";
import { INSTRUMENT_TYPES } from "./account";
import { INSTRUMENT_BACKED_TYPES, isInstrumentBackedType } from "./instrument";

describe("isInstrumentBackedType", () => {
  it("is true only for MUTUAL_FUND, STOCK, COMMODITY", () => {
    for (const type of INSTRUMENT_TYPES) {
      expect(isInstrumentBackedType(type)).toBe(
        (INSTRUMENT_BACKED_TYPES as readonly string[]).includes(type),
      );
    }
  });
});
