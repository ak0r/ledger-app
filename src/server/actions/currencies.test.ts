import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "../use-cases/profiles";
import { createCurrencyCore } from "./currencies.core";

describe("createCurrencyCore", () => {
  it("creates an INR Currency for an existing Profile", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const result = createCurrencyCore(db, {
      profileId: profile.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe("INR");
  });

  it("rejects a currency code that isn't 3 letters — fast client feedback", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const result = createCurrencyCore(db, {
      profileId: profile.id,
      code: "RUPEE",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a well-formed but unsupported currency at the domain layer (ADR-020)", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    // Shape-valid (3 letters) but not INR — Zod can't catch this, only the
    // domain layer knows the MVP-only currency list.
    const result = createCurrencyCore(db, {
      profileId: profile.id,
      code: "JPY",
      name: "Japanese Yen",
      symbol: "¥",
      minorUnitScale: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/INR/);
  });
});
