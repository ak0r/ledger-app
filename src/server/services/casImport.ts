import { createHash } from "node:crypto";
import { toQuantityMinorUnits } from "@/core";
import type { Db } from "../persistence/client";
import {
  isEcasResult,
  runCasParser,
  type CasParserResult,
  type CasParserRunner,
  type CasParserTransaction,
} from "../casImport/runCasParser";
import { findInstrumentByAmfiCode, findInstrumentByIsin } from "../repositories/instruments";
import { createInstrument } from "./instruments";
import { findPortfolioAccountsByProfile } from "../repositories/portfolioAccounts";
import { createPortfolioAccount } from "./portfolioAccounts";
import { findFoliosByPortfolioAccount } from "../repositories/folios";
import { createFolio } from "./folios";
import { createInvestmentTransaction, listInvestmentTransactions } from "./investmentTransactions";
import { recordHolding } from "./holdings";
import { findCurrencyById } from "../repositories/currencies";
import { findProfileById } from "../repositories/profiles";
import { NotFoundError, PanMismatchError, WrongStatementTypeError } from "./errors";
import { panHash } from "../security/pan";
import {
  insertPortfolioImport,
  updatePortfolioImportFields,
  type PortfolioImportRow,
} from "../repositories/portfolioImports";
import type { InvestmentTransactionType } from "@/core";

// CAMS/KFin CAS's own transaction vocabulary (casparser.enums.
// TransactionType, verified against the real library) mapped onto
// Ledger-App's deliberately smaller InvestmentTransactionType (Portfolio
// Adoption Plan §2). Tax/fee-only rows (STT/stamp duty/TDS) and
// segregation/misc/unknown/reversal rows have no unit-and-price shape to
// map onto and are skipped outright (`null`) rather than forced into one
// — the plan's own "avoid fees/stamp_duty initially" instruction, applied
// to import mapping rather than to a schema field.
function mapTransactionType(casType: string): InvestmentTransactionType | null {
  switch (casType) {
    case "PURCHASE":
    case "PURCHASE_SIP":
    case "DIVIDEND_REINVEST":
      return "BUY";
    case "REDEMPTION":
      return "SELL";
    case "DIVIDEND_PAYOUT":
      return "DIVIDEND";
    case "SWITCH_IN":
    case "SWITCH_IN_MERGER":
    case "GIFT_IN":
      return "TRANSFER_IN";
    case "SWITCH_OUT":
    case "SWITCH_OUT_MERGER":
    case "GIFT_OUT":
      return "TRANSFER_OUT";
    default:
      return null;
  }
}

// Content hash for idempotent re-import (schema.ts's own comment on
// `investment_transactions.dedup_key`) — stable across re-parsing the same
// statement, not tied to row insertion order. `identity` is the scheme's
// ISIN-or-AMFI-code (whichever resolved it, see getOrCreateInstrument) —
// not hardcoded to ISIN, since a scheme resolved via AMFI code alone still
// needs a stable dedup identity. `balance` (the statement's own running
// balance for the line) disambiguates two otherwise-identical same-day,
// same-amount rows (e.g. two same-day SWP redemptions) that would
// otherwise collide and have the second one silently dropped —
// `createInvestmentTransaction` treats a dedup-key match as "already
// imported, do nothing," not an error, so a collision here is a real data
// loss, not just a wasted re-check (Folioman's own `_dedup_key` includes
// this exact field for the same reason).
function dedupKey(profileId: string, identity: string, folioNumber: string, txn: CasParserTransaction): string {
  const raw = [profileId, identity, folioNumber, txn.date, txn.type, txn.units, txn.amount, txn.balance].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

// A CAS scheme's stable identity for dedup/instrument-resolution — ISIN
// first, AMFI code as fallback (a stale/matured/segregated scheme often
// still carries an AMFI code with no ISIN). `null` only when the statement
// gives neither, which is genuinely unresolvable (Portfolio Adoption
// Plan's "never name as identity" posture, core/shared/accountTypes.ts).
function schemeIdentity(scheme: { isin: string | null; amfi: string | null }): string | null {
  return scheme.isin || scheme.amfi || null;
}

export interface CasImportResult {
  portfolioImportId: string;
  transactionsCreated: number;
  transactionsSkipped: number;
  schemesProcessed: number;
}

// Upload -> Parse -> Preview -> Validate -> Commit (UX review, 2026-09-05
// accepted correction) — counts only, computed by walking the parsed
// statement the same way persistParsedCas will, but creating nothing:
// no Instrument/Folio/PortfolioAccount/InvestmentTransaction row exists
// until the user explicitly confirms and `runCasImport` actually runs.
// `duplicateCount` reuses the exact same `dedupKey` inputs (profileId +
// raw ISIN/folio-number/transaction fields from the statement itself, not
// any resolved DB id) persistParsedCas will hash at commit time, so a
// transaction already imported by an earlier statement shows up here
// without needing to create anything to check.
export interface CasImportPreview {
  folioCount: number;
  mutualFundCount: number;
  transactionCount: number;
  unresolvedSchemeCount: number;
  duplicateCount: number;
}

export interface CasImportPreviewInput {
  profileId: string;
  pdfBytes: Buffer;
  password: string;
}

export async function previewCasImport(
  db: Db,
  input: CasImportPreviewInput,
  runner: CasParserRunner = runCasParser,
): Promise<CasImportPreview> {
  const parsed = await runner(input.pdfBytes, input.password);
  if (isEcasResult(parsed)) throw new WrongStatementTypeError("ECAS");
  assertPanMatchesProfile(db, input.profileId, parsed);

  const existingDedupKeys = new Set(
    listInvestmentTransactions(db, input.profileId)
      .map((t) => t.dedupKey)
      .filter((key): key is string => key !== null),
  );

  const seenIdentities = new Set<string>();
  let mutualFundCount = 0;
  let transactionCount = 0;
  let unresolvedSchemeCount = 0;
  let duplicateCount = 0;

  for (const folio of parsed.folios) {
    for (const scheme of folio.schemes) {
      const identity = schemeIdentity(scheme);
      if (!identity) {
        unresolvedSchemeCount += 1;
        continue;
      }
      if (!seenIdentities.has(identity)) {
        seenIdentities.add(identity);
        mutualFundCount += 1;
      }
      for (const txn of scheme.transactions) {
        const type = mapTransactionType(txn.type);
        if (type === null || txn.units === null || txn.amount === null) continue;
        transactionCount += 1;
        if (existingDedupKeys.has(dedupKey(input.profileId, identity, folio.folio, txn))) {
          duplicateCount += 1;
        }
      }
    }
  }

  return {
    folioCount: parsed.folios.length,
    mutualFundCount,
    transactionCount,
    unresolvedSchemeCount,
    duplicateCount,
  };
}

export interface CasImportInput {
  profileId: string;
  pdfBytes: Buffer;
  password: string;
  filename?: string;
  // Every created InvestmentTransaction resolves its Money scale from
  // this real Currency row — CAS statements are always INR in practice,
  // but the caller (not this module) decides which of the Profile's own
  // currencies that maps to, same posture as every other money-touching
  // service in this codebase (never a bare currency-code string).
  currencyId: string;
}

// The CAS import pipeline (Portfolio Adoption Plan §1/§6) — deliberately
// synchronous (no task queue, same v1 posture Folioman itself started
// from) and deliberately simple: no partial-history chaining, no
// corporate-action replay, no reconciliation (plan §3 "Later"). Every
// scheme's Instrument is resolved by ISIN, or AMFI code when a scheme has
// no ISIN (created if not already in the catalogue); every Folio is
// resolved by number under one PortfolioAccount
// per Profile (created on first import); every transaction becomes an
// InvestmentTransaction with a content-hash dedup key, so re-running the
// same import is a safe no-op, not a duplicate.
export async function runCasImport(
  db: Db,
  input: CasImportInput,
  runner: CasParserRunner = runCasParser,
): Promise<CasImportResult> {
  const now = new Date().toISOString();
  const importRow: PortfolioImportRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    kind: "CAS",
    status: "PENDING",
    filename: input.filename ?? null,
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
    const currency = findCurrencyById(db, input.currencyId, input.profileId);
    if (!currency) {
      throw new NotFoundError(`Currency ${input.currencyId} not found for profile ${input.profileId}`);
    }

    const parsed = await runner(input.pdfBytes, input.password);
    if (isEcasResult(parsed)) throw new WrongStatementTypeError("ECAS");
    assertPanMatchesProfile(db, input.profileId, parsed);
    const summary = persistParsedCas(db, input.profileId, parsed, input.currencyId, currency.minorUnitScale);

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
      error: error instanceof Error ? error.message : "CAS import failed",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

// A Profile with no registered PAN (`panHash` never set) has nothing to
// check against yet — that's a soft warning surfaced on the import page
// (portfolio/imports/page.tsx), not a hard failure here. Once a PAN is
// registered, every folio's own investor PAN must hash-match it, or the
// statement belongs to someone else and nothing from it gets persisted.
function assertPanMatchesProfile(db: Db, profileId: string, parsed: CasParserResult): void {
  const profile = findProfileById(db, profileId);
  if (!profile?.panHash) return;

  const casPans = new Set(parsed.folios.map((folio) => folio.PAN?.trim().toUpperCase()).filter(Boolean));
  for (const casPan of casPans) {
    if (panHash(casPan!) !== profile.panHash) {
      throw new PanMismatchError();
    }
  }
}

function persistParsedCas(
  db: Db,
  profileId: string,
  parsed: CasParserResult,
  currencyId: string,
  currencyScale: number,
): Omit<CasImportResult, "portfolioImportId"> {
  const portfolioAccount = getOrCreateCasPortfolioAccount(db, profileId);

  let transactionsCreated = 0;
  let transactionsSkipped = 0;
  let schemesProcessed = 0;

  for (const casFolio of parsed.folios) {
    const folio = getOrCreateFolio(db, profileId, portfolioAccount.id, casFolio.folio);

    for (const scheme of casFolio.schemes) {
      schemesProcessed += 1;
      const identity = schemeIdentity(scheme);
      if (!identity) {
        // No stable identity to resolve/dedupe against — skip the whole
        // scheme rather than guess an Instrument from its display name
        // alone (core/shared/accountTypes.ts's own "never name as
        // identity" posture, applied here too).
        transactionsSkipped += scheme.transactions.length;
        continue;
      }

      const instrument = getOrCreateInstrument(db, scheme.isin, scheme.amfi, scheme.scheme);

      for (const txn of scheme.transactions) {
        const type = mapTransactionType(txn.type);
        if (type === null || txn.units === null || txn.amount === null) {
          transactionsSkipped += 1;
          continue;
        }

        createInvestmentTransaction(db, {
          profileId,
          instrumentId: instrument.id,
          folioId: folio.id,
          date: txn.date,
          type,
          units: toQuantityMinorUnits(type === "DIVIDEND" ? 0 : Math.abs(txn.units)),
          price:
            type === "DIVIDEND" || !txn.nav || txn.units === 0
              ? 0
              : Math.abs(txn.amount / txn.units),
          amount: Math.round(Math.abs(txn.amount) * 10 ** currencyScale),
          currencyId,
          source: "CAS_PDF",
          sourceRef: casFolio.folio,
          narration: txn.description,
          dedupKey: dedupKey(profileId, identity, casFolio.folio, txn),
        });
        transactionsCreated += 1;
      }

      if (scheme.close !== null && scheme.close !== undefined) {
        recordHolding(db, {
          profileId,
          instrumentId: instrument.id,
          folioId: folio.id,
          asOfDate: parsed.statement_period.to,
          units: toQuantityMinorUnits(scheme.close),
          source: "CAS_PDF",
          sourceRef: casFolio.folio,
        });
      }
    }
  }

  return { transactionsCreated, transactionsSkipped, schemesProcessed };
}

function getOrCreateCasPortfolioAccount(db: Db, profileId: string) {
  const existing = findPortfolioAccountsByProfile(db, profileId).find(
    (account) => account.type === "MUTUAL_FUND" && account.provider === "CAMS/KFin",
  );
  if (existing) return existing;
  return createPortfolioAccount(db, {
    profileId,
    name: "CAS Import",
    type: "MUTUAL_FUND",
    provider: "CAMS/KFin",
  });
}

function getOrCreateFolio(db: Db, profileId: string, portfolioAccountId: string, number: string) {
  const existing = findFoliosByPortfolioAccount(db, portfolioAccountId).find(
    (folio) => folio.number === number,
  );
  if (existing) return existing;
  return createFolio(db, { profileId, portfolioAccountId, number });
}

// ISIN first, AMFI code as fallback (schemeIdentity's own resolution
// order) — a scheme can arrive with either, both, or (handled by the
// caller before this is ever reached) neither.
function getOrCreateInstrument(db: Db, isin: string | null, amfiCode: string | null, name: string) {
  if (isin) {
    const existing = findInstrumentByIsin(db, "MUTUAL_FUND", isin);
    if (existing) return existing;
  } else if (amfiCode) {
    const existing = findInstrumentByAmfiCode(db, "MUTUAL_FUND", amfiCode);
    if (existing) return existing;
  }
  return createInstrument(db, { type: "MUTUAL_FUND", name, isin: isin ?? undefined, amfiCode: amfiCode ?? undefined });
}
