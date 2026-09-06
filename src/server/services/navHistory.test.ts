import { describe, expect, it } from "vitest";
import { toQuantityMinorUnits } from "@/core";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createInstrument } from "./instruments";
import { createInvestmentTransaction } from "./investmentTransactions";
import { getInstrumentValuation, recordNav, NO_NAV_DATA_REASON } from "./navHistory";

function setUp(db: ReturnType<typeof createTestDb>) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, { profileId: profile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
  const instrument = createInstrument(db, { type: "MUTUAL_FUND", name: "Example Flexi Cap", isin: "INF000X01234" });
  return { profile, currency, instrument };
}

describe("getInstrumentValuation", () => {
  it("reports a missingNavReason and no xirr when no NAV has ever been recorded", () => {
    const db = createTestDb();
    const { profile, instrument } = setUp(db);

    const valuation = getInstrumentValuation(db, profile.id, instrument.id, 2);

    expect(valuation.latestNav).toBeUndefined();
    expect(valuation.value).toBeUndefined();
    expect(valuation.missingNavReason).toBe(NO_NAV_DATA_REASON);
    expect(valuation.xirr).toBeUndefined();
  });

  it("has no missingNavReason once a NAV exists, even without enough history for an XIRR", () => {
    const db = createTestDb();
    const { profile, currency, instrument } = setUp(db);
    recordNav(db, { instrumentId: instrument.id, date: "2026-01-01", nav: 100 });

    const valuation = getInstrumentValuation(db, profile.id, instrument.id, currency.minorUnitScale);

    expect(valuation.missingNavReason).toBeUndefined();
    expect(valuation.latestNav).toBe(100);
  });

  it("computes a real XIRR once a NAV and a BUY transaction both exist", () => {
    const db = createTestDb();
    const { profile, currency, instrument } = setUp(db);
    createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      date: "2025-01-01",
      type: "BUY",
      units: toQuantityMinorUnits(10),
      price: 100,
      amount: 100000, // ₹1,000 at 2dp
      currencyId: currency.id,
      source: "MANUAL",
    });
    recordNav(db, { instrumentId: instrument.id, date: "2026-01-01", nav: 110 });

    const valuation = getInstrumentValuation(db, profile.id, instrument.id, currency.minorUnitScale);

    // 10 units bought for ₹1,000, now worth 10 x ₹110 = ₹1,100 a year later — 10%.
    expect(valuation.value).toBe(110000);
    expect(valuation.xirr).not.toBeUndefined();
    expect(valuation.xirr!).toBeCloseTo(0.1, 2);
  });
});
