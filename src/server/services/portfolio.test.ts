import { describe, expect, it } from "vitest";
import { toQuantityMinorUnits } from "@/core";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createInstrument } from "./instruments";
import { createPortfolioAccount, getPortfolioAccount, listPortfolioAccounts } from "./portfolioAccounts";
import { createFolio, getFolio, listFolios } from "./folios";
import {
  createInvestmentTransaction,
  listInvestmentTransactions,
  listInvestmentTransactionsForInstrument,
} from "./investmentTransactions";
import { computeCurrentPosition, getHoldingIntegrity, listHoldings, recordHolding } from "./holdings";
import { getInstrumentValuation, recordNav, NO_NAV_DATA_REASON } from "./navHistory";
import { InvestmentTransactionValidationError } from "./errors";

// Portfolio Adoption Plan (2026-09-05) V1 — a fresh setup per test, deliberately
// separate from Ledger's own setUpLedger fixture in services/transactions.test.ts:
// no Ledger Account/Transaction/Posting appears anywhere in this file, proving
// the Ledger/Portfolio delink (ADR-040) holds end to end, not just at the
// domain-import-boundary level.
function setUpPortfolio(db: ReturnType<typeof createTestDb>) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  const instrument = createInstrument(db, { type: "MUTUAL_FUND", name: "Parag Parikh Flexi Cap" });
  const portfolioAccount = createPortfolioAccount(db, {
    profileId: profile.id,
    name: "CAMS MF Folios",
    type: "MUTUAL_FUND",
  });
  const folio = createFolio(db, {
    profileId: profile.id,
    portfolioAccountId: portfolioAccount.id,
    number: "12345/0",
  });
  return { profile, currency, instrument, portfolioAccount, folio };
}

describe("PortfolioAccount / Folio", () => {
  it("creates and round-trips a PortfolioAccount scoped to its Profile", () => {
    const db = createTestDb();
    const { profile, portfolioAccount } = setUpPortfolio(db);

    expect(getPortfolioAccount(db, portfolioAccount.id, profile.id)).toEqual(portfolioAccount);
    expect(listPortfolioAccounts(db, profile.id)).toEqual([portfolioAccount]);
  });

  it("creates a Folio under a PortfolioAccount and scopes it to the same Profile", () => {
    const db = createTestDb();
    const { profile, portfolioAccount, folio } = setUpPortfolio(db);

    expect(getFolio(db, folio.id, profile.id)).toEqual(folio);
    expect(listFolios(db, portfolioAccount.id)).toEqual([folio]);
  });

  it("rejects a Folio under another Profile's PortfolioAccount", () => {
    const db = createTestDb();
    const { portfolioAccount } = setUpPortfolio(db);
    const otherProfile = createProfile(db, { name: "Someone Else" });

    expect(() =>
      createFolio(db, {
        profileId: otherProfile.id,
        portfolioAccountId: portfolioAccount.id,
        number: "999",
      }),
    ).toThrow();
  });
});

describe("InvestmentTransaction", () => {
  it("persists a BUY that satisfies units x price == amount", () => {
    const db = createTestDb();
    const { profile, currency, instrument, folio } = setUpPortfolio(db);

    const txn = createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-05",
      type: "BUY",
      units: toQuantityMinorUnits(100),
      price: 50,
      amount: 500000,
      currencyId: currency.id,
      source: "MANUAL",
    });

    expect(listInvestmentTransactions(db, profile.id)).toEqual([txn]);
    expect(listInvestmentTransactionsForInstrument(db, profile.id, instrument.id)).toEqual([txn]);
  });

  it("rejects a mismatched units x price x amount", () => {
    const db = createTestDb();
    const { profile, currency, instrument, folio } = setUpPortfolio(db);

    expect(() =>
      createInvestmentTransaction(db, {
        profileId: profile.id,
        instrumentId: instrument.id,
        folioId: folio.id,
        date: "2026-09-05",
        type: "BUY",
        units: toQuantityMinorUnits(100),
        price: 50,
        amount: 600000,
        currencyId: currency.id,
        source: "MANUAL",
      }),
    ).toThrow(InvestmentTransactionValidationError);
  });

  it("is idempotent on dedupKey — a second call with the same key is a no-op, not a duplicate", () => {
    const db = createTestDb();
    const { profile, currency, instrument, folio } = setUpPortfolio(db);
    const input = {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-05",
      type: "BUY" as const,
      units: toQuantityMinorUnits(100),
      price: 50,
      amount: 500000,
      currencyId: currency.id,
      source: "CSV_IMPORT" as const,
      dedupKey: "hash-1",
    };

    const first = createInvestmentTransaction(db, input);
    const second = createInvestmentTransaction(db, input);

    expect(second).toEqual(first);
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(1);
  });
});

describe("Holdings / current position / valuation", () => {
  it("nets the current position fresh from transactions, never from the holdings table", () => {
    const db = createTestDb();
    const { profile, currency, instrument, folio } = setUpPortfolio(db);

    createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-01",
      type: "BUY",
      units: toQuantityMinorUnits(100),
      price: 50,
      amount: 500000,
      currencyId: currency.id,
      source: "MANUAL",
    });
    createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-02",
      type: "SELL",
      units: toQuantityMinorUnits(30),
      price: 55,
      amount: 165000,
      currencyId: currency.id,
      source: "MANUAL",
    });

    expect(computeCurrentPosition(db, profile.id, instrument.id)).toBe(toQuantityMinorUnits(70));
  });

  it("records an observed Holding snapshot independently of computed position", () => {
    const db = createTestDb();
    const { profile, instrument, folio } = setUpPortfolio(db);

    const holding = recordHolding(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      asOfDate: "2026-09-01",
      units: toQuantityMinorUnits(100),
      source: "CAS_PDF",
    });

    expect(listHoldings(db, profile.id)).toEqual([holding]);
  });

  it("computes valuation as current position x latest NAV", () => {
    const db = createTestDb();
    const { profile, instrument, folio, currency } = setUpPortfolio(db);

    createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-01",
      type: "BUY",
      units: toQuantityMinorUnits(100),
      price: 50,
      amount: 500000,
      currencyId: currency.id,
      source: "MANUAL",
    });
    recordNav(db, { instrumentId: instrument.id, date: "2026-09-05", nav: 55 });

    const valuation = getInstrumentValuation(db, profile.id, instrument.id, currency.minorUnitScale);
    expect(valuation).toMatchObject({ units: toQuantityMinorUnits(100), latestNav: 55, value: 550000, missingNavReason: undefined });
    // A real BUY + a real NAV is enough for a rate to exist — the exact
    // number is core/portfolio/valuations/xirr.test.ts's own concern.
    expect(valuation.xirr).toBeTypeOf("number");
  });

  it("returns an undefined value when no NAV has ever been recorded", () => {
    const db = createTestDb();
    const { profile, instrument, currency } = setUpPortfolio(db);

    const valuation = getInstrumentValuation(db, profile.id, instrument.id, currency.minorUnitScale);
    expect(valuation).toEqual({
      units: 0,
      latestNav: undefined,
      value: undefined,
      missingNavReason: NO_NAV_DATA_REASON,
      xirr: undefined,
    });
  });
});

describe("getHoldingIntegrity", () => {
  it("is undefined when no snapshot has ever been observed — nothing to compare against", () => {
    const db = createTestDb();
    const { profile, instrument, folio, currency } = setUpPortfolio(db);
    createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-01",
      type: "BUY",
      units: toQuantityMinorUnits(100),
      price: 50,
      amount: 500000,
      currencyId: currency.id,
      source: "MANUAL",
    });

    expect(getHoldingIntegrity(db, profile.id, instrument.id)).toBeUndefined();
  });

  it("is VERIFIED when transaction history matches the statement's observed balance", () => {
    const db = createTestDb();
    const { profile, instrument, folio, currency } = setUpPortfolio(db);
    createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-01",
      type: "BUY",
      units: toQuantityMinorUnits(100),
      price: 50,
      amount: 500000,
      currencyId: currency.id,
      source: "MANUAL",
    });
    recordHolding(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      asOfDate: "2026-09-05",
      units: toQuantityMinorUnits(100),
      source: "CAS_PDF",
    });

    expect(getHoldingIntegrity(db, profile.id, instrument.id)).toBe("VERIFIED");
  });

  it("is SNAPSHOT_ONLY when the CAS statement's history doesn't go back far enough to cover the observed balance", () => {
    const db = createTestDb();
    const { profile, instrument, folio, currency } = setUpPortfolio(db);
    // Only one BUY imported, but the statement's own closing balance says
    // 150 units are held — 50 units of history are missing.
    createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-01",
      type: "BUY",
      units: toQuantityMinorUnits(100),
      price: 50,
      amount: 500000,
      currencyId: currency.id,
      source: "MANUAL",
    });
    recordHolding(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      asOfDate: "2026-09-05",
      units: toQuantityMinorUnits(150),
      source: "CAS_PDF",
    });

    expect(getHoldingIntegrity(db, profile.id, instrument.id)).toBe("SNAPSHOT_ONLY");
  });

  it("uses only the most recent observed snapshot per Folio when re-imports left more than one", () => {
    const db = createTestDb();
    const { profile, instrument, folio, currency } = setUpPortfolio(db);
    createInvestmentTransaction(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      date: "2026-09-01",
      type: "BUY",
      units: toQuantityMinorUnits(100),
      price: 50,
      amount: 500000,
      currencyId: currency.id,
      source: "MANUAL",
    });
    // A stale snapshot from an earlier, smaller import...
    recordHolding(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      asOfDate: "2026-08-01",
      units: toQuantityMinorUnits(999),
      source: "CAS_PDF",
    });
    // ...superseded by a later one that actually matches.
    recordHolding(db, {
      profileId: profile.id,
      instrumentId: instrument.id,
      folioId: folio.id,
      asOfDate: "2026-09-05",
      units: toQuantityMinorUnits(100),
      source: "CAS_PDF",
    });

    expect(getHoldingIntegrity(db, profile.id, instrument.id)).toBe("VERIFIED");
  });
});
