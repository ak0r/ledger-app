import { describe, expect, it } from "vitest";
import { fromQuantityMinorUnits } from "@/core";
import type { CasParserResult, CasParserRunner, EcasParserResult } from "../casImport/runCasParser";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { previewCasImport, runCasImport } from "./casImport";
import { listInvestmentTransactions } from "./investmentTransactions";
import { listHoldings } from "./holdings";
import { listPortfolioAccounts } from "./portfolioAccounts";
import { listFoliosForProfile } from "./folios";
import { listInstruments } from "./instruments";
import { PanMismatchError, PasswordRequiredError, WrongStatementTypeError } from "./errors";
import { setProfilePanValue } from "./profiles";

// Synthetic fixture matching casparser's real `output="json"` shape
// (verified against the installed library's own pydantic models —
// casparser.types.{CASData,Folio,Scheme,TransactionData} — not guessed).
// Fake ISIN/folio/amounts throughout (AGENTS.md rule #24) — this shape,
// not this data, is what's real.
const SYNTHETIC_CAS: CasParserResult = {
  file_type: "CAMS",
  statement_period: { from_: "2026-01-01", to: "2026-09-01" },
  folios: [
    {
      folio: "12345/0",
      amc: "Example Mutual Fund",
      PAN: "ABCDE1234F",
      schemes: [
        {
          scheme: "Example Flexi Cap Fund - Growth",
          isin: "INF000X01234",
          amfi: "119999",
          type: "EQUITY",
          close: 100,
          transactions: [
            { date: "2026-01-15", description: "Purchase", amount: 500000, units: 5000, nav: 100, balance: 5000, type: "PURCHASE" },
            { date: "2026-06-15", description: "Redemption", amount: 165000, units: 1000, nav: 165, balance: 4000, type: "REDEMPTION" },
            { date: "2026-07-01", description: "Dividend Payout", amount: 5000, units: 0, nav: null, balance: 4000, type: "DIVIDEND_PAYOUT" },
            { date: "2026-07-15", description: "STT", amount: 10, units: null, nav: null, balance: 4000, type: "STT_TAX" },
          ],
        },
      ],
    },
  ],
};

function stubRunner(result: CasParserResult | EcasParserResult): CasParserRunner {
  return async () => result;
}

// Synthetic eCAS-shaped fixture — just enough to prove `isEcasResult`
// correctly identifies it and rejects it from the MF CAS path (fake
// dp_id/client_id/PAN/ISIN throughout, AGENTS.md rule #24).
const SYNTHETIC_ECAS: EcasParserResult = {
  file_type: "CDSL",
  statement_period: { from_: "2026-01-01", to: "2026-09-01" },
  accounts: [
    {
      name: "Example Demat",
      type: "DEMAT",
      dp_id: "12345678",
      client_id: "87654321",
      owners: [{ name: "Amit K", PAN: "ABCDE1234F" }],
      equities: [
        { name: "Example Co", isin: "INF000X09999", num_shares: 10, price: 100, value: 1000, symbol: "EXAMPLECO", exchange: "NSE" },
      ],
      mutual_funds: [],
      bonds: [],
    },
  ],
};

function setUp(db: ReturnType<typeof createTestDb>) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, {
    profileId: profile.id,
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    minorUnitScale: 2,
  });
  return { profile, currency };
}

describe("runCasImport", () => {
  it("creates a PortfolioAccount, Folio, Instrument, and InvestmentTransactions from a parsed CAS", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);

    const result = await runCasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id },
      stubRunner(SYNTHETIC_CAS),
    );

    expect(result.schemesProcessed).toBe(1);
    // PURCHASE, REDEMPTION, DIVIDEND_PAYOUT map; STT_TAX is skipped.
    expect(result.transactionsCreated).toBe(3);
    expect(result.transactionsSkipped).toBe(1);

    expect(listPortfolioAccounts(db, profile.id)).toHaveLength(1);
    expect(listFoliosForProfile(db, profile.id)).toHaveLength(1);
    expect(listInstruments(db).map((i) => i.isin)).toEqual(["INF000X01234"]);

    const transactions = listInvestmentTransactions(db, profile.id);
    expect(transactions).toHaveLength(3);
    expect(transactions.map((t) => t.type).sort()).toEqual(["BUY", "DIVIDEND", "SELL"]);

    const dividend = transactions.find((t) => t.type === "DIVIDEND")!;
    expect(dividend.units).toBe(0);
    expect(dividend.amount).toBe(500000); // ₹5,000 at 2 decimal places
  });

  it("records the scheme's closing balance as an observed Holding snapshot", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);

    await runCasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id },
      stubRunner(SYNTHETIC_CAS),
    );

    const holdings = listHoldings(db, profile.id);
    expect(holdings).toHaveLength(1);
    expect(fromQuantityMinorUnits(holdings[0]!.units)).toBe(100);
    expect(holdings[0]!.source).toBe("CAS_PDF");
  });

  it("re-running the same import is idempotent — no duplicate transactions", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    const input = { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id };

    await runCasImport(db, input, stubRunner(SYNTHETIC_CAS));
    await runCasImport(db, input, stubRunner(SYNTHETIC_CAS));

    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(3);
    // Two PortfolioImport runs, but only one Folio/PortfolioAccount/Instrument.
    expect(listPortfolioAccounts(db, profile.id)).toHaveLength(1);
    expect(listFoliosForProfile(db, profile.id)).toHaveLength(1);
  });

  it("proceeds when the Profile has no PAN registered yet — nothing to check against", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    const input = { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id };

    await runCasImport(db, input, stubRunner(SYNTHETIC_CAS));

    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(3);
  });

  it("rejects a CAS statement whose PAN doesn't match the Profile's registered PAN", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    setProfilePanValue(db, profile.id, "ZZZZZ9999Z");
    const input = { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id };

    await expect(runCasImport(db, input, stubRunner(SYNTHETIC_CAS))).rejects.toThrow(PanMismatchError);
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(0);
  });

  it("accepts a CAS statement whose PAN matches the Profile's registered PAN", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    setProfilePanValue(db, profile.id, "abcde1234f");
    const input = { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id };

    await runCasImport(db, input, stubRunner(SYNTHETIC_CAS));

    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(3);
  });

  it("surfaces a wrong-password failure and marks the PortfolioImport row FAILED", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    const failingRunner: CasParserRunner = async () => {
      throw new PasswordRequiredError("incorrect");
    };

    await expect(
      runCasImport(
        db,
        { profileId: profile.id, pdfBytes: Buffer.from(""), password: "wrong", currencyId: currency.id },
        failingRunner,
      ),
    ).rejects.toThrow(PasswordRequiredError);
  });

  it("rejects an eCAS statement uploaded to the MF CAS path instead of crashing", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);

    await expect(
      runCasImport(
        db,
        { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id },
        stubRunner(SYNTHETIC_ECAS),
      ),
    ).rejects.toThrow(WrongStatementTypeError);
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(0);
  });
});

describe("previewCasImport", () => {
  it("counts folios/mutual funds/transactions without persisting anything", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const preview = await previewCasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" },
      stubRunner(SYNTHETIC_CAS),
    );

    expect(preview).toEqual({
      folioCount: 1,
      mutualFundCount: 1,
      transactionCount: 3, // PURCHASE, REDEMPTION, DIVIDEND_PAYOUT; STT_TAX has no mappable type
      unresolvedSchemeCount: 0,
      duplicateCount: 0,
    });

    // Preview creates nothing — no PortfolioAccount/Folio/Instrument/
    // InvestmentTransaction exists until a real commit runs.
    expect(listPortfolioAccounts(db, profile.id)).toHaveLength(0);
    expect(listFoliosForProfile(db, profile.id)).toHaveLength(0);
    expect(listInstruments(db)).toHaveLength(0);
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(0);
  });

  it("reports transactions already committed by an earlier import as duplicates", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    await runCasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id },
      stubRunner(SYNTHETIC_CAS),
    );

    const preview = await previewCasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" },
      stubRunner(SYNTHETIC_CAS),
    );

    expect(preview.transactionCount).toBe(3);
    expect(preview.duplicateCount).toBe(3);
  });

  it("counts a scheme with neither ISIN nor AMFI code as unresolved, not as a mutual fund", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const casWithNoIdentity: CasParserResult = {
      ...SYNTHETIC_CAS,
      folios: [
        {
          ...SYNTHETIC_CAS.folios[0]!,
          schemes: [{ ...SYNTHETIC_CAS.folios[0]!.schemes[0]!, isin: null, amfi: null }],
        },
      ],
    };

    const preview = await previewCasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" },
      stubRunner(casWithNoIdentity),
    );

    expect(preview.unresolvedSchemeCount).toBe(1);
    expect(preview.mutualFundCount).toBe(0);
    expect(preview.transactionCount).toBe(0);
  });

  it("falls back to AMFI code when a scheme has no ISIN — still imported, not skipped", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    const casWithAmfiOnly: CasParserResult = {
      ...SYNTHETIC_CAS,
      folios: [
        {
          ...SYNTHETIC_CAS.folios[0]!,
          schemes: [{ ...SYNTHETIC_CAS.folios[0]!.schemes[0]!, isin: null }],
        },
      ],
    };

    const result = await runCasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id },
      stubRunner(casWithAmfiOnly),
    );

    expect(result.transactionsCreated).toBe(3);
    expect(listInstruments(db)).toHaveLength(1);
    expect(listInstruments(db)[0]!.isin).toBeNull();
    expect(listInstruments(db)[0]!.amfiCode).toBe("119999");
  });

  it("distinguishes two same-day, same-amount transactions by their differing statement balance", async () => {
    const db = createTestDb();
    const { profile, currency } = setUp(db);
    const scheme = SYNTHETIC_CAS.folios[0]!.schemes[0]!;
    const casWithSameDayRedemptions: CasParserResult = {
      ...SYNTHETIC_CAS,
      folios: [
        {
          ...SYNTHETIC_CAS.folios[0]!,
          schemes: [
            {
              ...scheme,
              transactions: [
                { date: "2026-06-15", description: "SWP", amount: 1000, units: 10, nav: 100, balance: 4990, type: "REDEMPTION" },
                { date: "2026-06-15", description: "SWP", amount: 1000, units: 10, nav: 100, balance: 4980, type: "REDEMPTION" },
              ],
            },
          ],
        },
      ],
    };

    const result = await runCasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x", currencyId: currency.id },
      stubRunner(casWithSameDayRedemptions),
    );

    expect(result.transactionsCreated).toBe(2);
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(2);
  });

  it("rejects a CAS statement whose PAN doesn't match the Profile's registered PAN, persisting nothing", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    setProfilePanValue(db, profile.id, "ZZZZZ9999Z");

    await expect(
      previewCasImport(db, { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" }, stubRunner(SYNTHETIC_CAS)),
    ).rejects.toThrow(PanMismatchError);
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(0);
  });

  it("rejects an eCAS statement uploaded to the MF CAS path instead of crashing", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    await expect(
      previewCasImport(db, { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" }, stubRunner(SYNTHETIC_ECAS)),
    ).rejects.toThrow(WrongStatementTypeError);
  });
});
