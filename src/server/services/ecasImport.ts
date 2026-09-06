import { toQuantityMinorUnits } from "@/core";
import type { Db } from "../persistence/client";
import {
  isEcasResult,
  runCasParser,
  type CasParserRunner,
  type EcasParserAccount,
  type EcasParserResult,
} from "../casImport/runCasParser";
import { findInstrumentByIsin } from "../repositories/instruments";
import { createInstrument } from "./instruments";
import { findPortfolioAccountsByProfile } from "../repositories/portfolioAccounts";
import { createPortfolioAccount } from "./portfolioAccounts";
import { findFoliosByPortfolioAccount } from "../repositories/folios";
import { createFolio } from "./folios";
import { recordHolding } from "./holdings";
import { findProfileById } from "../repositories/profiles";
import { MultiPanStatementError, PanMismatchError, WrongStatementTypeError } from "./errors";
import { panHash } from "../security/pan";
import {
  insertPortfolioImport,
  updatePortfolioImportFields,
  type PortfolioImportRow,
} from "../repositories/portfolioImports";

// Demat eCAS import (NSDL/CDSL holdings snapshot — Stock tradebook import
// plan, Phase 3) — the equity equivalent of MF CAS's closing balance, but
// structurally different in one important way: an eCAS has no transaction
// history at all, only a point-in-time position per demat account. This
// module only ever calls `recordHolding` (an *observed* snapshot,
// schema.ts's own doc comment) — it never creates an InvestmentTransaction
// (Folioman's own `HoldingSource.ecas` is holdings-only; there is no
// ecas-sourced transaction path to port).
//
// V1 cut: only `account.equities` is read. `mutual_funds`/`bonds` also
// exist on the real NSDLCASData shape but are deliberately skipped — a
// demat-held Mutual Fund already has its own path via MF CAS, and Ledger
// has no BOND InstrumentBackedType to receive one (a separate, larger
// domain decision, AGENTS.md rule #18).

// The Portfolio Account/Folio identity an eCAS carries in the file itself
// (unlike tradebook import, where the user manually types/picks a Folio) —
// shown plainly in the preview/result so a user can copy this exact string
// into their tradebook's Folio field if they want the two sources to join
// under `getHoldingIntegrity` (Folio-identity mismatch risk, plan's own
// note: a UX nudge, not an automatic merge).
function dematAccountNumber(account: EcasParserAccount): string {
  return `${account.dp_id}-${account.client_id}`;
}

export interface EcasImportPreview {
  accountCount: number;
  equityCount: number;
  unresolvedEquityCount: number;
  dematAccountNumbers: string[];
}

export interface EcasImportPreviewInput {
  profileId: string;
  pdfBytes: Buffer;
  password: string;
}

export async function previewEcasImport(
  db: Db,
  input: EcasImportPreviewInput,
  runner: CasParserRunner = runCasParser,
): Promise<EcasImportPreview> {
  const parsed = await runner(input.pdfBytes, input.password);
  if (!isEcasResult(parsed)) throw new WrongStatementTypeError("CAS");
  assertEcasPanMatchesProfile(db, input.profileId, parsed);

  let equityCount = 0;
  let unresolvedEquityCount = 0;
  const dematAccountNumbers: string[] = [];

  for (const account of parsed.accounts) {
    if (!account.dp_id || !account.client_id) continue;
    dematAccountNumbers.push(dematAccountNumber(account));
    for (const equity of account.equities) {
      if (!equity.isin) {
        unresolvedEquityCount += 1;
        continue;
      }
      equityCount += 1;
    }
  }

  return {
    accountCount: dematAccountNumbers.length,
    equityCount,
    unresolvedEquityCount,
    dematAccountNumbers,
  };
}

export interface EcasImportResult {
  portfolioImportId: string;
  holdingsRecorded: number;
  accountsProcessed: number;
  equitiesSkipped: number;
  dematAccountNumbers: string[];
}

export interface EcasImportInput {
  profileId: string;
  pdfBytes: Buffer;
  password: string;
  filename?: string;
}

export async function runEcasImport(
  db: Db,
  input: EcasImportInput,
  runner: CasParserRunner = runCasParser,
): Promise<EcasImportResult> {
  const now = new Date().toISOString();
  const importRow: PortfolioImportRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    kind: "ECAS",
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
    const parsed = await runner(input.pdfBytes, input.password);
    if (!isEcasResult(parsed)) throw new WrongStatementTypeError("CAS");
    assertEcasPanMatchesProfile(db, input.profileId, parsed);
    const summary = persistParsedEcas(db, input.profileId, parsed);

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
      error: error instanceof Error ? error.message : "eCAS import failed",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

// Same "no PAN registered yet = nothing to check" posture as CAS's own
// `assertPanMatchesProfile`, plus one extra check CAS doesn't need: an
// eCAS statement's own accounts must all agree on a single PAN first
// (Folioman's `ecas_investor_identity`) — CAS never needed this because a
// mismatched folio there just fails the very same per-folio-vs-Profile
// check, but an eCAS's cross-account agreement is checked independently of
// whether a Profile PAN is even registered.
function assertEcasPanMatchesProfile(db: Db, profileId: string, parsed: EcasParserResult): void {
  const pans = new Set(
    parsed.accounts
      .flatMap((account) => account.owners.map((owner) => owner.PAN?.trim().toUpperCase()))
      .filter((pan): pan is string => Boolean(pan)),
  );
  if (pans.size > 1) {
    throw new MultiPanStatementError();
  }

  const profile = findProfileById(db, profileId);
  if (!profile?.panHash) return;

  for (const pan of pans) {
    if (panHash(pan) !== profile.panHash) {
      throw new PanMismatchError();
    }
  }
}

function persistParsedEcas(
  db: Db,
  profileId: string,
  parsed: EcasParserResult,
): Omit<EcasImportResult, "portfolioImportId"> {
  const portfolioAccount = getOrCreateEcasPortfolioAccount(db, profileId);

  let holdingsRecorded = 0;
  let accountsProcessed = 0;
  let equitiesSkipped = 0;
  const dematAccountNumbers: string[] = [];

  for (const account of parsed.accounts) {
    if (!account.dp_id || !account.client_id) {
      equitiesSkipped += account.equities.length;
      continue;
    }
    accountsProcessed += 1;
    const number = dematAccountNumber(account);
    dematAccountNumbers.push(number);
    const folio = getOrCreateEcasFolio(db, profileId, portfolioAccount.id, number);

    for (const equity of account.equities) {
      if (!equity.isin) {
        // No stable identity to resolve/dedupe against — same "never guess
        // an Instrument from its display name alone" posture as CAS's own
        // scheme-with-no-identity skip.
        equitiesSkipped += 1;
        continue;
      }

      const instrument = getOrCreateEquityInstrument(db, equity.isin, equity.name, equity.symbol, equity.exchange);
      recordHolding(db, {
        profileId,
        instrumentId: instrument.id,
        folioId: folio.id,
        asOfDate: parsed.statement_period.to,
        units: toQuantityMinorUnits(equity.num_shares),
        source: "ECAS_PDF",
        sourceRef: number,
      });
      holdingsRecorded += 1;
    }
  }

  return { holdingsRecorded, accountsProcessed, equitiesSkipped, dematAccountNumbers };
}

function getOrCreateEcasPortfolioAccount(db: Db, profileId: string) {
  const existing = findPortfolioAccountsByProfile(db, profileId).find(
    (account) => account.type === "STOCK" && account.provider === "NSDL/CDSL eCAS",
  );
  if (existing) return existing;
  return createPortfolioAccount(db, {
    profileId,
    name: "Demat (eCAS)",
    type: "STOCK",
    provider: "NSDL/CDSL eCAS",
  });
}

function getOrCreateEcasFolio(db: Db, profileId: string, portfolioAccountId: string, number: string) {
  const existing = findFoliosByPortfolioAccount(db, portfolioAccountId).find((folio) => folio.number === number);
  if (existing) return existing;
  return createFolio(db, { profileId, portfolioAccountId, number });
}

// ISIN-resolved, same as CAS's own `getOrCreateInstrument` — but the
// exchange determines which of nseCode/bseCode the backfilled `symbol`
// becomes, unlike tradebook import (which only ever sees an NSE trading
// symbol and always sets nseCode). Defaults to nseCode when the exchange
// is unrecognized — the common case in practice.
function getOrCreateEquityInstrument(
  db: Db,
  isin: string,
  name: string,
  symbol: string | null,
  exchange: string | null,
) {
  const existing = findInstrumentByIsin(db, "STOCK", isin);
  if (existing) return existing;

  const isBse = exchange?.trim().toUpperCase() === "BSE";
  return createInstrument(db, {
    type: "STOCK",
    name,
    isin,
    nseCode: symbol && !isBse ? symbol : undefined,
    bseCode: symbol && isBse ? symbol : undefined,
  });
}
