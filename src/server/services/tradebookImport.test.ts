import { describe, expect, it } from "vitest";
import { fromQuantityMinorUnits } from "@/core";
import { createTestDb } from "../testing/createTestDb";
import { createProfile } from "./profiles";
import { createCurrency } from "./currencies";
import { createPortfolioAccount } from "./portfolioAccounts";
import { createFolio } from "./folios";
import { listInvestmentTransactions } from "./investmentTransactions";
import { listInstruments } from "./instruments";
import { previewTradebookImport, runTradebookImport } from "./tradebookImport";
import { NotFoundError } from "./errors";

// Same synthetic shape as portfolioImporters/zerodhaTradebookCsv.test.ts —
// fake ISIN/prices throughout (AGENTS.md rule #24).
const SAMPLE_CSV = `symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
EXAMPLECO,INF000X09999,2026-01-15,NSE,EQ,EQ,buy,false,10.000000,1000.000000,T1,O1,2026-01-15T10:30:00
EXAMPLECO,INF000X09999,2026-06-15,NSE,EQ,EQ,sell,false,4.000000,1200.000000,T2,O2,2026-06-15T11:00:00
`;

function setUp(db: ReturnType<typeof createTestDb>) {
  const profile = createProfile(db, { name: "Amit" });
  const currency = createCurrency(db, { profileId: profile.id, code: "INR", name: "Indian Rupee", symbol: "₹", minorUnitScale: 2 });
  const portfolioAccount = createPortfolioAccount(db, { profileId: profile.id, name: "Zerodha", type: "STOCK", provider: "Zerodha" });
  const folio = createFolio(db, { profileId: profile.id, portfolioAccountId: portfolioAccount.id, number: "DEMAT123" });
  return { profile, currency, portfolioAccount, folio };
}

describe("previewTradebookImport", () => {
  it("counts transactions without persisting anything", async () => {
    const db = createTestDb();
    const { profile, folio } = setUp(db);

    const preview = await previewTradebookImport(db, {
      profileId: profile.id,
      folioId: folio.id,
      fileBytes: Buffer.from(SAMPLE_CSV),
      filename: "tradebook.csv",
    });

    expect(preview).toEqual({ transactionCount: 2, unresolvedCount: 0, duplicateCount: 0 });
    expect(listInstruments(db)).toHaveLength(0);
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(0);
  });

  it("throws when the Folio doesn't belong to this Profile", async () => {
    const db = createTestDb();
    const { profile } = setUp(db);
    await expect(
      previewTradebookImport(db, {
        profileId: profile.id,
        folioId: "not-a-real-folio",
        fileBytes: Buffer.from(SAMPLE_CSV),
        filename: "tradebook.csv",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("reports rows already committed by an earlier import as duplicates", async () => {
    const db = createTestDb();
    const { profile, currency, portfolioAccount, folio } = setUp(db);
    await runTradebookImport(db, {
      profileId: profile.id,
      portfolioAccountId: portfolioAccount.id,
      folioId: folio.id,
      currencyId: currency.id,
      fileBytes: Buffer.from(SAMPLE_CSV),
      filename: "tradebook.csv",
    });

    const preview = await previewTradebookImport(db, {
      profileId: profile.id,
      folioId: folio.id,
      fileBytes: Buffer.from(SAMPLE_CSV),
      filename: "tradebook.csv",
    });

    expect(preview).toEqual({ transactionCount: 2, unresolvedCount: 0, duplicateCount: 2 });
  });
});

describe("runTradebookImport", () => {
  it("creates a STOCK Instrument and InvestmentTransactions from a parsed tradebook", async () => {
    const db = createTestDb();
    const { profile, currency, portfolioAccount, folio } = setUp(db);

    const result = await runTradebookImport(db, {
      profileId: profile.id,
      portfolioAccountId: portfolioAccount.id,
      folioId: folio.id,
      currencyId: currency.id,
      fileBytes: Buffer.from(SAMPLE_CSV),
      filename: "tradebook.csv",
    });

    expect(result.transactionsCreated).toBe(2);
    expect(result.transactionsSkipped).toBe(0);
    expect(listInstruments(db)).toHaveLength(1);
    expect(listInstruments(db)[0]!.type).toBe("STOCK");
    expect(listInstruments(db)[0]!.isin).toBe("INF000X09999");
    expect(listInstruments(db)[0]!.nseCode).toBe("EXAMPLECO");

    const transactions = listInvestmentTransactions(db, profile.id);
    expect(transactions).toHaveLength(2);
    expect(transactions.map((t) => t.type).sort()).toEqual(["BUY", "SELL"]);
    expect(transactions.map((t) => t.sourceRef).sort()).toEqual(["T1", "T2"]);
    expect(transactions.every((t) => t.source === "CSV_IMPORT")).toBe(true);

    const buy = transactions.find((t) => t.type === "BUY")!;
    expect(fromQuantityMinorUnits(buy.units)).toBe(10);
    expect(buy.amount).toBe(1000000); // 10 x ₹1,000 at 2dp
  });

  it("re-running the same import is idempotent — no duplicate transactions", async () => {
    const db = createTestDb();
    const { profile, currency, portfolioAccount, folio } = setUp(db);
    const input = {
      profileId: profile.id,
      portfolioAccountId: portfolioAccount.id,
      folioId: folio.id,
      currencyId: currency.id,
      fileBytes: Buffer.from(SAMPLE_CSV),
      filename: "tradebook.csv",
    };

    await runTradebookImport(db, input);
    await runTradebookImport(db, input);

    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(2);
    expect(listInstruments(db)).toHaveLength(1);
  });

  it("keeps two fills with identical date/symbol/quantity/price distinct when trade IDs differ", async () => {
    const db = createTestDb();
    const { profile, currency, portfolioAccount, folio } = setUp(db);
    const csv = `symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
EXAMPLECO,INF000X09999,2026-01-15,NSE,EQ,EQ,buy,false,10.000000,1000.000000,T1,O1,2026-01-15T10:30:00
EXAMPLECO,INF000X09999,2026-01-15,NSE,EQ,EQ,buy,false,10.000000,1000.000000,T2,O1,2026-01-15T10:30:01
`;

    const result = await runTradebookImport(db, {
      profileId: profile.id,
      portfolioAccountId: portfolioAccount.id,
      folioId: folio.id,
      currencyId: currency.id,
      fileBytes: Buffer.from(csv),
      filename: "tradebook.csv",
    });

    expect(result.transactionsCreated).toBe(2);
    expect(listInvestmentTransactions(db, profile.id)).toHaveLength(2);
  });

  it("skips a row with no ISIN rather than guessing an Instrument from the symbol", async () => {
    const db = createTestDb();
    const { profile, currency, portfolioAccount, folio } = setUp(db);
    const csv = `symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
UNLISTEDCO,,2026-01-15,NSE,EQ,EQ,buy,false,10.000000,1000.000000,T1,O1,2026-01-15T10:30:00
`;

    const result = await runTradebookImport(db, {
      profileId: profile.id,
      portfolioAccountId: portfolioAccount.id,
      folioId: folio.id,
      currencyId: currency.id,
      fileBytes: Buffer.from(csv),
      filename: "tradebook.csv",
    });

    expect(result.transactionsCreated).toBe(0);
    expect(result.transactionsSkipped).toBe(1);
    expect(listInstruments(db)).toHaveLength(0);
  });
});
