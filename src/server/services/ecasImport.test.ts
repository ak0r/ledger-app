import { describe, expect, it } from "vitest";
import { fromQuantityMinorUnits } from "@/core";
import type { CasParserResult, CasParserRunner, EcasParserResult } from "../casImport/runCasParser";
import { createTestDb } from "../testing/createTestDb";
import { createProfile, setProfilePanValue } from "./profiles";
import { previewEcasImport, runEcasImport } from "./ecasImport";
import { listHoldings } from "./holdings";
import { listInvestmentTransactions } from "./investmentTransactions";
import { listPortfolioAccounts } from "./portfolioAccounts";
import { listFoliosForProfile } from "./folios";
import { listInstruments } from "./instruments";
import { MultiPanStatementError, PanMismatchError, WrongStatementTypeError } from "./errors";

// Synthetic fixture matching casparser's real NSDLCASData `output="json"`
// shape (verified against the installed library's own pydantic models —
// casparser.types.{NSDLCASData,DematAccount,Equity,DematOwner} — not
// guessed). Fake dp_id/client_id/PAN/ISIN throughout (AGENTS.md rule #24).
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
        {
          name: "Example Co",
          isin: "INF000X09999",
          num_shares: 10,
          price: 100,
          value: 1000,
          symbol: "EXAMPLECO",
          exchange: "NSE",
        },
      ],
      mutual_funds: [],
      bonds: [],
    },
  ],
};

const SYNTHETIC_CAS: CasParserResult = {
  file_type: "CAMS",
  statement_period: { from_: "2026-01-01", to: "2026-09-01" },
  folios: [],
};

function stubRunner(result: CasParserResult | EcasParserResult): CasParserRunner {
  return async () => result;
}

function setUp(db: ReturnType<typeof createTestDb>) {
  return { profile: createProfile(db, { name: "Amit" }) };
}

describe("runEcasImport", () => {
  it("records a Holding per equity, resolving a STOCK Instrument by ISIN — never an InvestmentTransaction", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const result = await runEcasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" },
      stubRunner(SYNTHETIC_ECAS),
    );

    expect(result.accountsProcessed).toBe(1);
    expect(result.holdingsRecorded).toBe(1);
    expect(result.equitiesSkipped).toBe(0);
    expect(result.dematAccountNumbers).toEqual(["12345678-87654321"]);

    expect(listInstruments(db)).toHaveLength(1);
    expect(listInstruments(db)[0]!.type).toBe("STOCK");
    expect(listInstruments(db)[0]!.isin).toBe("INF000X09999");
    expect(listInstruments(db)[0]!.nseCode).toBe("EXAMPLECO");

    expect(listPortfolioAccounts(db, profile.id)).toHaveLength(1);
    expect(listFoliosForProfile(db, profile.id)).toHaveLength(1);
    expect(listFoliosForProfile(db, profile.id)[0]!.number).toBe("12345678-87654321");

    const holdings = listHoldings(db, profile.id);
    expect(holdings).toHaveLength(1);
    expect(fromQuantityMinorUnits(holdings[0]!.units)).toBe(10);
    expect(holdings[0]!.source).toBe("ECAS_PDF");

    // The whole point of an eCAS: a holdings snapshot, never a transaction.
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(0);
  });

  it("sets bseCode instead of nseCode when casparser's own exchange field says BSE", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const bseFixture: EcasParserResult = {
      ...SYNTHETIC_ECAS,
      accounts: [{ ...SYNTHETIC_ECAS.accounts[0]!, equities: [{ ...SYNTHETIC_ECAS.accounts[0]!.equities[0]!, exchange: "BSE" }] }],
    };

    await runEcasImport(db, { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" }, stubRunner(bseFixture));

    expect(listInstruments(db)[0]!.nseCode).toBeNull();
    expect(listInstruments(db)[0]!.bseCode).toBe("EXAMPLECO");
  });

  it("re-running the same import adds another observed snapshot, not a duplicate rejection", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const input = { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" };

    await runEcasImport(db, input, stubRunner(SYNTHETIC_ECAS));
    await runEcasImport(db, input, stubRunner(SYNTHETIC_ECAS));

    // holdings rows are never deduped/upserted (schema.ts's own comment) —
    // unlike CAS's InvestmentTransactions, re-importing legitimately adds
    // another point-in-time observation.
    expect(listHoldings(db, profile.id)).toHaveLength(2);
    expect(listInstruments(db)).toHaveLength(1);
    expect(listPortfolioAccounts(db, profile.id)).toHaveLength(1);
    expect(listFoliosForProfile(db, profile.id)).toHaveLength(1);
  });

  it("skips an account with no dp_id/client_id and an equity with no ISIN", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const messyFixture: EcasParserResult = {
      ...SYNTHETIC_ECAS,
      accounts: [
        { ...SYNTHETIC_ECAS.accounts[0]!, dp_id: null },
        {
          ...SYNTHETIC_ECAS.accounts[0]!,
          dp_id: "11111111",
          client_id: "22222222",
          equities: [{ ...SYNTHETIC_ECAS.accounts[0]!.equities[0]!, isin: null }],
        },
      ],
    };

    const result = await runEcasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" },
      stubRunner(messyFixture),
    );

    expect(result.accountsProcessed).toBe(1);
    expect(result.holdingsRecorded).toBe(0);
    expect(result.equitiesSkipped).toBe(2);
    expect(listHoldings(db, profile.id)).toHaveLength(0);
  });

  it("rejects a statement whose demat accounts disagree on PAN", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    const multiPanFixture: EcasParserResult = {
      ...SYNTHETIC_ECAS,
      accounts: [
        SYNTHETIC_ECAS.accounts[0]!,
        { ...SYNTHETIC_ECAS.accounts[0]!, dp_id: "99999999", owners: [{ name: "Someone Else", PAN: "ZZZZZ9999Z" }] },
      ],
    };

    await expect(
      runEcasImport(db, { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" }, stubRunner(multiPanFixture)),
    ).rejects.toThrow(MultiPanStatementError);
    expect(listHoldings(db, profile.id)).toHaveLength(0);
  });

  it("rejects an eCAS statement whose PAN doesn't match the Profile's registered PAN", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    setProfilePanValue(db, profile.id, "ZZZZZ9999Z");

    await expect(
      runEcasImport(db, { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" }, stubRunner(SYNTHETIC_ECAS)),
    ).rejects.toThrow(PanMismatchError);
    expect(listHoldings(db, profile.id)).toHaveLength(0);
  });

  it("rejects an MF CAS statement uploaded to the eCAS path instead of crashing", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    await expect(
      runEcasImport(db, { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" }, stubRunner(SYNTHETIC_CAS)),
    ).rejects.toThrow(WrongStatementTypeError);
  });
});

describe("previewEcasImport", () => {
  it("counts accounts/equities without persisting anything", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    const preview = await previewEcasImport(
      db,
      { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" },
      stubRunner(SYNTHETIC_ECAS),
    );

    expect(preview).toEqual({
      accountCount: 1,
      equityCount: 1,
      unresolvedEquityCount: 0,
      dematAccountNumbers: ["12345678-87654321"],
    });

    expect(listPortfolioAccounts(db, profile.id)).toHaveLength(0);
    expect(listFoliosForProfile(db, profile.id)).toHaveLength(0);
    expect(listInstruments(db)).toHaveLength(0);
    expect(listHoldings(db, profile.id)).toHaveLength(0);
  });

  it("rejects an MF CAS statement uploaded to the eCAS path instead of crashing", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);

    await expect(
      previewEcasImport(db, { profileId: profile.id, pdfBytes: Buffer.from(""), password: "x" }, stubRunner(SYNTHETIC_CAS)),
    ).rejects.toThrow(WrongStatementTypeError);
  });
});
