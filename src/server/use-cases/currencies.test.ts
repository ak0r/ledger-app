import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { findCurrenciesByProfile } from "../repositories/currencies";
import { createProfile } from "./profiles";
import { createCurrency, listCurrencies } from "./currencies";
import { UnsupportedCurrencyError } from "./errors";

describe("createCurrency", () => {
  it("persists an INR Currency scoped to its Profile", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const currency = createCurrency(db, {
      profileId: profile.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });

    expect(currency.profileId).toBe(profile.id);
    expect(currency.code).toBe("INR");
  });

  it("rejects a non-INR currency code (MVP-only, ADR-020)", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    expect(() =>
      createCurrency(db, {
        profileId: profile.id,
        code: "JPY",
        name: "Japanese Yen",
        symbol: "¥",
        minorUnitScale: 0,
      }),
    ).toThrow(UnsupportedCurrencyError);
  });

  it("is Currency creation as a step separate from Profile creation", () => {
    // Resolved 2026-08-15 (HANDOFF.md open decisions #1): createProfile never
    // implicitly creates a Currency row.
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    expect(findCurrenciesByProfile(db, profile.id)).toEqual([]);
  });
});

describe("listCurrencies", () => {
  it("scopes to the given Profile", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const other = createProfile(db, { name: "Partner" });
    createCurrency(db, {
      profileId: profile.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });

    expect(listCurrencies(db, profile.id)).toHaveLength(1);
    expect(listCurrencies(db, other.id)).toEqual([]);
  });
});
