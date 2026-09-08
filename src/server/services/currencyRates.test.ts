import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { NotFoundError } from "./errors";
import { deleteCurrencyRate, listCurrencyRatesForCurrency, resolveCurrencyRate, upsertCurrencyRate } from "./currencyRates";

function setUp(db: ReturnType<typeof createTestDb>) {
  const profile = createProfile(db, { name: "Amit" });
  // INR is created first, so createCurrency auto-assigns it as this
  // Profile's Primary/Base Currency.
  const inr = createCurrency(db, { profileId: profile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
  const jpy = createCurrency(db, { profileId: profile.id, code: "JPY", name: "Japanese Yen", symbol: "¥", minorUnitScale: 0 });
  return { profile, inr, jpy };
}

describe("upsertCurrencyRate", () => {
  it("converts a major-unit decimal rate accounting for the two currencies' minor-unit scales", () => {
    const db = createTestDb();
    const { profile, jpy } = setUp(db);
    // "1 JPY = ₹0.55" -> 55 paise per 1 JPY (JPY scale 0, INR scale 2) -> 55/1.
    const row = upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.55 });
    expect(row.rateNum).toBe(55);
    expect(row.rateDenom).toBe(1);
  });

  it("creating a second rate for the same currency and date is rejected (duplicate)", () => {
    const db = createTestDb();
    const { profile, jpy } = setUp(db);
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.5 });
    expect(() => upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.6 })).toThrow(
      /already exists/,
    );
  });

  it("editing an existing rate (id provided) updates it in place", () => {
    const db = createTestDb();
    const { profile, jpy } = setUp(db);
    const created = upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.5 });
    const edited = upsertCurrencyRate(db, {
      id: created.id,
      profileId: profile.id,
      currencyId: jpy.id,
      date: "2026-09-02",
      rateDecimal: 0.6,
    });
    expect(edited.id).toBe(created.id);
    expect(edited.date).toBe("2026-09-02");
    expect(edited.rateNum).toBe(60);

    const rates = listCurrencyRatesForCurrency(db, jpy.id, profile.id);
    expect(rates).toHaveLength(1);
    expect(rates[0]).toEqual({ id: created.id, date: "2026-09-02", rateDecimal: 0.6 });
  });

  it("editing a rate's date into collision with a different existing rate is rejected", () => {
    const db = createTestDb();
    const { profile, jpy } = setUp(db);
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.5 });
    const second = upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-02", rateDecimal: 0.6 });
    expect(() =>
      upsertCurrencyRate(db, { id: second.id, profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.7 }),
    ).toThrow(/already exists/);
  });

  it("rejects a currencyId that doesn't belong to the caller's Profile", () => {
    const db = createTestDb();
    const { profile: profileA } = setUp(db);
    const { jpy: jpyB } = setUp(db);
    expect(() =>
      upsertCurrencyRate(db, { profileId: profileA.id, currencyId: jpyB.id, date: "2026-09-01", rateDecimal: 0.5 }),
    ).toThrow(NotFoundError);
  });
});

describe("deleteCurrencyRate", () => {
  it("removes the rate", () => {
    const db = createTestDb();
    const { profile, jpy } = setUp(db);
    const created = upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.5 });
    deleteCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, rateId: created.id });
    expect(listCurrencyRatesForCurrency(db, jpy.id, profile.id)).toEqual([]);
  });

  it("throws NotFoundError for a rate that doesn't belong to the given currency", () => {
    const db = createTestDb();
    const { profile, jpy, inr } = setUp(db);
    const created = upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.5 });
    expect(() => deleteCurrencyRate(db, { profileId: profile.id, currencyId: inr.id, rateId: created.id })).toThrow(NotFoundError);
  });
});

describe("resolveCurrencyRate", () => {
  it("returns 1/1 when the currency is the Base Currency, regardless of any stored rate", () => {
    const db = createTestDb();
    const { profile, inr } = setUp(db);
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: inr.id, date: "2026-09-01", rateDecimal: 2 });
    expect(resolveCurrencyRate(db, inr.id, inr.id, "2026-09-01")).toEqual({ num: 1, denom: 1 });
  });

  it("prefers the exact-date rate when one exists", () => {
    const db = createTestDb();
    const { profile, inr, jpy } = setUp(db);
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-08-01", rateDecimal: 0.5 });
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.6 });
    expect(resolveCurrencyRate(db, jpy.id, inr.id, "2026-09-01")).toEqual({ num: 60, denom: 1 });
  });

  it("falls back to the latest rate on or before the date when there's no exact match", () => {
    const db = createTestDb();
    const { profile, inr, jpy } = setUp(db);
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-08-01", rateDecimal: 0.5 });
    expect(resolveCurrencyRate(db, jpy.id, inr.id, "2026-09-15")).toEqual({ num: 50, denom: 1 });
  });

  it("never uses a future-dated rate", () => {
    const db = createTestDb();
    const { profile, inr, jpy } = setUp(db);
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-10-01", rateDecimal: 0.9 });
    // No rate on or before 2026-09-01 exists (only a future one) -> parity.
    expect(resolveCurrencyRate(db, jpy.id, inr.id, "2026-09-01")).toEqual({ num: 1, denom: 1 });
  });

  it("falls back to 1/1 parity when no rate exists at all", () => {
    const db = createTestDb();
    const { inr, jpy } = setUp(db);
    expect(resolveCurrencyRate(db, jpy.id, inr.id, "2026-09-01")).toEqual({ num: 1, denom: 1 });
  });

  it("editing/deleting a CurrencyRate never changes what an already-resolved rate was at that point in time", () => {
    // Rate Semantics: "Historical transactions must NOT change when
    // CurrencyRate records are subsequently added, edited, or deleted."
    // resolveCurrencyRate is always a live lookup — this test documents
    // that a caller who resolved+copied a rate earlier keeps that copy
    // unaffected by later mutation, not that resolveCurrencyRate itself
    // is somehow frozen (it isn't; it's a default, not a historical log).
    const db = createTestDb();
    const { profile, inr, jpy } = setUp(db);
    const created = upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.5 });
    const resolvedAtCreation = resolveCurrencyRate(db, jpy.id, inr.id, "2026-09-01");
    expect(resolvedAtCreation).toEqual({ num: 50, denom: 1 });

    deleteCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, rateId: created.id });

    // The already-copied value a caller took earlier is untouched...
    expect(resolvedAtCreation).toEqual({ num: 50, denom: 1 });
    // ...even though a fresh lookup now correctly reflects the deletion.
    expect(resolveCurrencyRate(db, jpy.id, inr.id, "2026-09-01")).toEqual({ num: 1, denom: 1 });
  });
});

describe("listCurrencyRatesForCurrency", () => {
  it("lists every rate for the currency, newest date first, as display-ready major-unit decimals", () => {
    const db = createTestDb();
    const { profile, jpy } = setUp(db);
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-08-01", rateDecimal: 0.5 });
    upsertCurrencyRate(db, { profileId: profile.id, currencyId: jpy.id, date: "2026-09-01", rateDecimal: 0.6 });
    const rates = listCurrencyRatesForCurrency(db, jpy.id, profile.id);
    expect(rates.map((r) => r.date)).toEqual(["2026-09-01", "2026-08-01"]);
    expect(rates.map((r) => r.rateDecimal)).toEqual([0.6, 0.5]);
  });
});
