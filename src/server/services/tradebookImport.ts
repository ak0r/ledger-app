import { createHash } from "node:crypto";
import { toQuantityMinorUnits, type NormalizedTradebookRow } from "@/core";
import type { Db } from "../persistence/client";
import { detectTradebookAdapter } from "../portfolioImporters";
import { NotFoundError, UnsupportedImportFormatError } from "./errors";
import { findInstrumentByIsin } from "../repositories/instruments";
import { createInstrument } from "./instruments";
import { getPortfolioAccount } from "./portfolioAccounts";
import { getFolio } from "./folios";
import { createInvestmentTransaction, listInvestmentTransactions } from "./investmentTransactions";
import { findCurrencyById } from "../repositories/currencies";
import {
  insertPortfolioImport,
  updatePortfolioImportFields,
  type PortfolioImportRow,
} from "../repositories/portfolioImports";

// Content hash for idempotent re-import, same shape/rationale as CAS
// import's own `dedupKey` (services/casImport.ts) — `tradeId` is included
// from day one here, unlike CAS's dedup key which needed a follow-up fix
// (adding `balance`) after a confirmed same-day/same-amount collision bug.
// A tradebook's version of that exact risk is worse: one order can produce
// several fills sharing date/symbol/quantity/price, distinguishable only by
// the broker's own trade ID (confirmed against Folioman's own tradebook-
// import docs and its `_dedup_key`, which includes the trade ID for this
// reason).
function dedupKey(profileId: string, isin: string, folioId: string, row: NormalizedTradebookRow): string {
  const raw = [profileId, isin, folioId, row.date, row.type, row.units, row.price, row.tradeId].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

async function parseTradebook(fileBytes: Buffer, filename: string): Promise<NormalizedTradebookRow[]> {
  const adapter = detectTradebookAdapter(filename, fileBytes);
  if (!adapter) {
    throw new UnsupportedImportFormatError("no tradebook adapter matched this file");
  }
  return adapter.parse(fileBytes);
}

export interface TradebookImportPreview {
  transactionCount: number;
  unresolvedCount: number;
  duplicateCount: number;
}

// Upload -> Parse -> Preview -> Validate -> Commit, same split as CAS
// import (services/casImport.ts) — zero writes, no PortfolioImport row
// until a real commit runs. Unlike CAS, there's no PAN/investor-identity
// check here — a tradebook carries no PAN at all (confirmed against
// Folioman's own docs), identity is the Instrument's own ISIN per row.
export async function previewTradebookImport(
  db: Db,
  input: { profileId: string; folioId: string; fileBytes: Buffer; filename: string },
): Promise<TradebookImportPreview> {
  getFolio(db, input.folioId, input.profileId); // validates ownership, throws if not found/not this Profile's

  const rows = await parseTradebook(input.fileBytes, input.filename);
  const existingDedupKeys = new Set(
    listInvestmentTransactions(db, input.profileId)
      .map((t) => t.dedupKey)
      .filter((key): key is string => key !== null),
  );

  let transactionCount = 0;
  let unresolvedCount = 0;
  let duplicateCount = 0;
  for (const row of rows) {
    if (!row.isin) {
      unresolvedCount += 1;
      continue;
    }
    transactionCount += 1;
    if (existingDedupKeys.has(dedupKey(input.profileId, row.isin, input.folioId, row))) {
      duplicateCount += 1;
    }
  }

  return { transactionCount, unresolvedCount, duplicateCount };
}

export interface TradebookImportResult {
  portfolioImportId: string;
  transactionsCreated: number;
  transactionsSkipped: number;
}

export interface TradebookImportInput {
  profileId: string;
  portfolioAccountId: string;
  folioId: string;
  fileBytes: Buffer;
  filename: string;
  currencyId: string;
}

// The only write path. Unlike CAS (which resolves/creates its own
// PortfolioAccount+Folio internally from statement content), a tradebook
// carries no account identity at all — `portfolioAccountId`/`folioId` are
// already resolved/created by the caller before this runs (the user picked
// or created them in the UI, services/tradebookImport.ts's own plan
// rationale: no fuzzy identifier matching to build for a file format that
// never carries the identity to match against).
export async function runTradebookImport(db: Db, input: TradebookImportInput): Promise<TradebookImportResult> {
  const now = new Date().toISOString();
  const importRow: PortfolioImportRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    kind: "CSV",
    status: "PENDING",
    filename: input.filename,
    sourceRef: null,
    result: null,
    error: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  insertPortfolioImport(db, importRow);

  try {
    getPortfolioAccount(db, input.portfolioAccountId, input.profileId);
    getFolio(db, input.folioId, input.profileId);
    const currency = findCurrencyById(db, input.currencyId, input.profileId);
    if (!currency) {
      throw new NotFoundError(`Currency ${input.currencyId} not found for profile ${input.profileId}`);
    }

    const rows = await parseTradebook(input.fileBytes, input.filename);
    const summary = persistRows(db, input, rows, currency.minorUnitScale);

    updatePortfolioImportFields(db, importRow.id, input.profileId, {
      status: "SUCCESS",
      result: summary,
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { portfolioImportId: importRow.id, ...summary };
  } catch (error) {
    updatePortfolioImportFields(db, importRow.id, input.profileId, {
      status: "FAILED",
      error: error instanceof Error ? error.message : "Tradebook import failed",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

function persistRows(
  db: Db,
  input: TradebookImportInput,
  rows: NormalizedTradebookRow[],
  currencyScale: number,
): Omit<TradebookImportResult, "portfolioImportId"> {
  let transactionsCreated = 0;
  let transactionsSkipped = 0;

  for (const row of rows) {
    if (!row.isin) {
      // No stable identity to resolve/dedupe against — skip rather than
      // guess an Instrument from the trading symbol alone (same "never
      // name as identity" posture CAS import already applies to schemes).
      transactionsSkipped += 1;
      continue;
    }

    const instrument = getOrCreateInstrument(db, row.isin, row.name ?? row.symbol ?? row.isin, row.symbol);
    const amount = Math.round(row.units * row.price * 10 ** currencyScale);

    createInvestmentTransaction(db, {
      profileId: input.profileId,
      instrumentId: instrument.id,
      folioId: input.folioId,
      date: row.date,
      type: row.type,
      units: toQuantityMinorUnits(row.units),
      price: row.price,
      amount,
      currencyId: input.currencyId,
      source: "CSV_IMPORT",
      sourceRef: row.tradeId ?? undefined,
      dedupKey: dedupKey(input.profileId, row.isin, input.folioId, row),
    });
    transactionsCreated += 1;
  }

  return { transactionsCreated, transactionsSkipped };
}

function getOrCreateInstrument(db: Db, isin: string, name: string, symbol: string | null) {
  const existing = findInstrumentByIsin(db, "STOCK", isin);
  if (existing) return existing;
  return createInstrument(db, { type: "STOCK", name, isin, nseCode: symbol ?? undefined });
}
