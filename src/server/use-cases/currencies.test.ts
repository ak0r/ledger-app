import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { findCurrenciesByProfile, insertCurrency } from "../repositories/currencies";
import { createProfile, getProfile, setProfilePrimaryCurrency } from "./profiles";
import { addCurrencyFromCatalog, createCurrency, listCurrencies } from "./currencies";
import { CurrencyAlreadyAddedError, UnsupportedCurrencyError } from "./errors";

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

  it("rejects a currency code not in the Currency Catalogue", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    expect(() =>
      createCurrency(db, {
        profileId: profile.id,
        code: "ZZZ",
        name: "Not A Real Currency",
        symbol: "?",
        minorUnitScale: 2,
      }),
    ).toThrow(UnsupportedCurrencyError);
  });

  it("accepts a non-INR currency code that is in the Currency Catalogue", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const currency = createCurrency(db, {
      profileId: profile.id,
      code: "JPY",
      name: "Japanese Yen",
      symbol: "¥",
      minorUnitScale: 0,
    });

    expect(currency.code).toBe("JPY");
  });

  it("is Currency creation as a step separate from Profile creation", () => {
    // Resolved 2026-08-15 (HANDOFF.md open decisions #1): createProfile never
    // implicitly creates a Currency row.
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    expect(findCurrenciesByProfile(db, profile.id)).toEqual([]);
  });

  it("becomes the Profile's Primary Currency automatically when it's the first one", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    expect(profile.primaryCurrencyId).toBeNull();

    const inr = createCurrency(db, {
      profileId: profile.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });

    expect(getProfile(db, profile.id)?.primaryCurrencyId).toBe(inr.id);
  });

  it("does not reassign an already-set Primary Currency when a second Currency is added", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const inr = createCurrency(db, {
      profileId: profile.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });
    expect(getProfile(db, profile.id)?.primaryCurrencyId).toBe(inr.id);

    createCurrency(db, {
      profileId: profile.id,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      minorUnitScale: 2,
    });

    expect(getProfile(db, profile.id)?.primaryCurrencyId).toBe(inr.id);
  });

  it("does not steal Primary for a second Currency when the first bypassed createCurrency (e.g. demo seed) and left primaryCurrencyId null", () => {
    // Reproduces a real bug: a Currency inserted directly (like
    // demo/dataset.ts's raw insertCurrency, before demo-data.ts's own fix)
    // leaves primaryCurrencyId null even though the Profile already has a
    // Currency. The next real createCurrency call must not read that null
    // as "this Profile has no Currency yet" and wrongly primary itself.
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const now = new Date().toISOString();
    const inr = {
      id: crypto.randomUUID(),
      profileId: profile.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
      createdAt: now,
      updatedAt: now,
    };
    insertCurrency(db, inr);
    expect(getProfile(db, profile.id)?.primaryCurrencyId).toBeNull();

    createCurrency(db, {
      profileId: profile.id,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      minorUnitScale: 2,
    });

    expect(getProfile(db, profile.id)?.primaryCurrencyId).toBeNull();
  });

  it("does not reassign a Primary Currency the user already chose explicitly", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const inr = createCurrency(db, {
      profileId: profile.id,
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      minorUnitScale: 2,
    });
    const usd = createCurrency(db, {
      profileId: profile.id,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      minorUnitScale: 2,
    });
    setProfilePrimaryCurrency(db, profile.id, usd.id);

    createCurrency(db, {
      profileId: profile.id,
      code: "JPY",
      name: "Japanese Yen",
      symbol: "¥",
      minorUnitScale: 0,
    });

    expect(getProfile(db, profile.id)?.primaryCurrencyId).toBe(usd.id);
    expect(getProfile(db, profile.id)?.primaryCurrencyId).not.toBe(inr.id);
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

describe("addCurrencyFromCatalog", () => {
  it("derives name/symbol/minorUnitScale from the Currency Catalogue, ignoring anything else", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    const currency = addCurrencyFromCatalog(db, { profileId: profile.id, code: "JPY" });

    expect(currency).toMatchObject({
      profileId: profile.id,
      code: "JPY",
      name: "Japanese Yen",
      symbol: "¥",
      minorUnitScale: 0,
    });
  });

  it("rejects a code not in the Currency Catalogue", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });

    expect(() => addCurrencyFromCatalog(db, { profileId: profile.id, code: "ZZZ" })).toThrow(
      UnsupportedCurrencyError,
    );
  });

  it("rejects a code already added to this Profile", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    addCurrencyFromCatalog(db, { profileId: profile.id, code: "INR" });

    expect(() => addCurrencyFromCatalog(db, { profileId: profile.id, code: "INR" })).toThrow(
      CurrencyAlreadyAddedError,
    );
  });

  it("allows the same code across different Profiles", () => {
    const db = createTestDb();
    const profile = createProfile(db, { name: "Amit" });
    const other = createProfile(db, { name: "Partner" });
    addCurrencyFromCatalog(db, { profileId: profile.id, code: "INR" });

    expect(() => addCurrencyFromCatalog(db, { profileId: other.id, code: "INR" })).not.toThrow();
  });
});
