import {
  deriveIdentifierVariants,
  isPossibleIdentifierMatch,
  resolveUnknownCounterAccount,
  validateTransaction,
  type ColumnMapping,
  type ImportDirection,
  type NormalizedImportRow,
  type PdfCropPage,
  type RawTable,
} from "@/core";
import type { Db } from "../persistence/client";
import type { AccountType } from "../persistence/schema";
import {
  createAccount,
  type CreateAccountInput,
} from "./accounts";
import { findAccountRefs, findAccountsByProfile } from "../repositories/accounts";
import { findCurrenciesByProfile } from "../repositories/currencies";
import {
  findAccountIdByIdentifier,
  findAccountIdentifiersByProfile,
  insertAccountIdentifier,
  type AccountIdentifierRow,
} from "../repositories/accountIdentifiers";
import { insertImportFile, findImportFilesByProfile, type ImportFileRow } from "../repositories/importFiles";
import { insertPostings, insertTransaction, findPostingsForReconciliation } from "../repositories/transactions";
import type { PostingRow, TransactionRow } from "../repositories/transactions";
import {
  resolveImport,
  readXlsRows,
  buildRowsFromMapping,
  suggestColumnMapping,
  extractCroppedTable,
  getPageCount,
} from "../importers";
import { NotFoundError, TransactionValidationError, UnsupportedImportFormatError } from "./errors";
import { derivePostings, resolveBaseCurrency, type PostingInput } from "./transactions";
import { findPossibleDuplicates, type DuplicateMatch } from "@/lib/duplicate-detection";

// A catch-all counter-account is identified by classification+name, not id,
// until Account Resolution finds (or Commit creates) the real row — same
// "EXPENSE:Unknown" / "INCOME:Unknown" pair every time (domain's
// `resolveUnknownCounterAccount`), and the same shape a user-chosen
// brand-new counterpart account uses too (Import Workflow delta §8 —
// Account Resolution is a proposal the user can redirect to any existing
// account or a new one, not just the two catch-alls).
function counterAccountKey(classification: "EXPENSE" | "INCOME", name: string): string {
  return `${classification}:${name.trim().toLowerCase()}`;
}

function findExistingCounterAccountId(
  accounts: { id: string; name: string; classification: string }[],
  classification: "EXPENSE" | "INCOME",
  name: string,
): string | undefined {
  return accounts.find(
    (account) =>
      account.classification === classification && account.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )?.id;
}

export interface PreviewCandidate {
  // Which uploaded file (client-assigned, opaque) this candidate came from
  // — an Import workspace can hold candidates from several files at once
  // (Import Workflow delta §14); each becomes its own ImportFile at commit.
  fileKey: string;
  date: string;
  description: string;
  amountMinor: number;
  direction: ImportDirection;
  reference?: string;
  // Echoed straight from `NormalizedImportRow` — cross-source
  // reconciliation (`lib/duplicate-detection.ts`, GPay importer delta)
  // uses both as "if available" refinements, never a hard requirement.
  time?: string;
  counterparty?: string;
  // Account Resolution delta §3 — no upfront account selection, so this is
  // provisional: null defers to the file's own resolved/created account
  // (finalized at commit); non-null means an existing account is already
  // known, either because the file resolved to one or the user picked a
  // different one for this specific row (per-row override, Delta 2).
  knownAccountId: string | null;
  // Resolved now if a matching Account already exists; null means it's
  // pending one of `newAccounts` being approved and created at commit.
  counterAccountId: string | null;
  counterAccountKey: string;
  // Cross-source reconciliation against already-committed history (GPay
  // importer delta) — `lib/duplicate-detection.ts` run server-side
  // against `findPostingsForReconciliation`'s own query, for whichever
  // rows already resolved to a real Account (rule #6: date has always
  // meant this Profile's own data only, via that Account's ownership).
  // The *within-session* cross-file check (uploading a GPay export and a
  // Bank statement together) stays client-side — the server only ever
  // sees one file's own rows per `previewImport` call, no visibility
  // across others in the same workspace.
  possibleDuplicate: DuplicateMatch["reason"] | null;
  // GPay importer delta — a row whose own `accountIdentifier` (Stone 1)
  // didn't exact-match an existing Account gets proposed as a *new*
  // source Account instead of silently deferring to whatever the file's
  // own single default happens to be (the original gap: "Federal Bank
  // XX97 | RuPay credit card" never got its own new-Account card, its
  // rows just got folded into whichever account the file itself
  // resolved to). Null for every row that either resolved directly
  // (`knownAccountId` non-null) or carries no identifier at all (defers
  // to the file's own resolution, unchanged).
  proposedSourceAccountKey: string | null;
}

export interface NewAccountDescriptor {
  key: string;
  classification: "EXPENSE" | "INCOME";
  name: string;
}

// GPay importer delta — mirrors `NewAccountDescriptor`'s shape for the
// counterpart side, but for a per-row *source* Account proposal: never
// Expense/Income, always Asset/Liability with a real Account Type (a
// credit-card-routed row must become a Liability/CREDIT_CARD Account, not
// an Asset/BANK one — `gpayPdf.ts`'s own text already says which).
export interface NewSourceAccountDescriptor {
  key: string;
  identifier: string;
  name: string;
  classification: "ASSET" | "LIABILITY";
  accountType: AccountType;
}

export type AccountResolutionStatus = "resolved" | "possibleMatch" | "ambiguous" | "new" | "unidentified";

export interface AccountResolutionCandidate {
  accountId: string;
  accountName: string;
  knownIdentifiers: string[];
}

// The account-resolution outcome for one uploaded file (delta §10-§16).
// "unidentified" is the generic-CSV case: the adapter found no source
// account identity at all, so there's nothing to match against — the user
// resolves manually, same shape as the other three unresolved states.
export interface AccountResolution {
  status: AccountResolutionStatus;
  identifier: string | null;
  resolvedAccountId: string | null;
  candidates: AccountResolutionCandidate[];
  proposedName: string | null;
  proposedClassification: "ASSET" | "LIABILITY";
  proposedAccountType: AccountType;
}

function resolveAccountForFile(db: Db, profileId: string, identifier: string | null, institutionLabel: string): AccountResolution {
  const base = {
    proposedName: null as string | null,
    proposedClassification: "ASSET" as const,
    proposedAccountType: "BANK" as AccountType,
  };

  if (!identifier) {
    return { status: "unidentified", identifier: null, resolvedAccountId: null, candidates: [], ...base };
  }

  const exactAccountId = findAccountIdByIdentifier(db, profileId, identifier);
  if (exactAccountId) {
    return { status: "resolved", identifier, resolvedAccountId: exactAccountId, candidates: [], ...base };
  }

  const known = findAccountIdentifiersByProfile(db, profileId);
  const matchesByAccount = new Map<string, AccountResolutionCandidate>();
  for (const row of known) {
    if (!isPossibleIdentifierMatch(identifier, row.identifier)) continue;
    const entry = matchesByAccount.get(row.accountId) ?? { accountId: row.accountId, accountName: row.accountName, knownIdentifiers: [] };
    entry.knownIdentifiers.push(row.identifier);
    matchesByAccount.set(row.accountId, entry);
  }
  const candidates = [...matchesByAccount.values()];

  if (candidates.length === 1) {
    return { status: "possibleMatch", identifier, resolvedAccountId: null, candidates, ...base };
  }
  if (candidates.length >= 2) {
    return { status: "ambiguous", identifier, resolvedAccountId: null, candidates, ...base };
  }

  const last4 = identifier.length > 4 ? identifier.slice(-4) : identifier;
  return {
    status: "new",
    identifier,
    resolvedAccountId: null,
    candidates: [],
    proposedName: `${institutionLabel} ••••${last4}`,
    proposedClassification: "ASSET",
    proposedAccountType: "BANK",
  };
}

export interface ImportPreview {
  source: string;
  accountResolution: AccountResolution;
  candidates: PreviewCandidate[];
  newAccounts: NewAccountDescriptor[];
  newSourceAccounts: NewSourceAccountDescriptor[];
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  transactionCount: number;
}

export interface PreviewImportInput {
  profileId: string;
  filename: string;
  fileBase64: string;
  // Client-assigned — stamped onto every candidate this call produces so
  // the client can merge multiple files' candidates into one workspace and
  // group them back by file again at commit.
  fileKey: string;
  // Password-protected import files (Federal Bank Account PDF adapter) —
  // used only for the one `adapter.parse()` call below, never persisted
  // anywhere (rule: never store a statement password). Absent/undefined
  // for every non-encrypted adapter, which ignores it.
  password?: string;
}

// Read-only (delta §9 — parsing/normalization/account resolution may run
// automatically, Ledger mutation may not). Nothing here is persisted; see
// commitImport for the only write path. Called once per uploaded file — the
// client merges results across files into its own multi-file workspace
// state (Import Workflow delta §1/§14). No account selection required
// beforehand (Account Resolution delta §3) — the adapter and the source
// account are both detected from the file itself.
export async function previewImport(db: Db, input: PreviewImportInput): Promise<ImportPreview> {
  const buffer = Buffer.from(input.fileBase64, "base64");

  const currency = findCurrenciesByProfile(db, input.profileId)[0];
  if (!currency) {
    throw new NotFoundError(`No currency configured for profile ${input.profileId}`);
  }

  const { adapter, parsed } = await resolveImport(input.filename, buffer, currency.minorUnitScale, input.password);
  if (parsed.rows.length === 0) {
    throw new UnsupportedImportFormatError("no importable rows found in file");
  }

  return buildPreviewFromRows(
    db,
    input.profileId,
    input.fileKey,
    adapter.id,
    parsed.rows,
    parsed.accountIdentifier,
    adapter.institutionLabel,
  );
}

// Ledger Custom Importer delta — the account-resolution + candidate-
// building logic every import source shares once it's reduced to
// `NormalizedImportRow[]`, whether those rows came from a registered
// adapter (`previewImport` above) or a user's own column mapping
// (`previewCustomXlsImport`/`previewCustomPdfImport` below). Kept as one
// function so this logic is never duplicated per source.
export function buildPreviewFromRows(
  db: Db,
  profileId: string,
  fileKey: string,
  source: string,
  rows: NormalizedImportRow[],
  accountIdentifier: string | null,
  institutionLabel: string,
): ImportPreview {
  const accountResolution = resolveAccountForFile(db, profileId, accountIdentifier, institutionLabel);
  const existingAccounts = findAccountsByProfile(db, profileId);
  const newAccountsByKey = new Map<string, NewAccountDescriptor>();
  const newSourceAccountsByKey = new Map<string, NewSourceAccountDescriptor>();

  const candidates: PreviewCandidate[] = rows.map((row) => {
    const descriptor = resolveUnknownCounterAccount(row.direction);
    const key = counterAccountKey(descriptor.classification, descriptor.name);
    const existingId = findExistingCounterAccountId(existingAccounts, descriptor.classification, descriptor.name);
    if (!existingId && !newAccountsByKey.has(key)) {
      newAccountsByKey.set(key, { key, classification: descriptor.classification, name: descriptor.name });
    }

    // A row carrying its own source-account identity (e.g. GPay, which has
    // no account of its own — every row instead tags the real bank/card it
    // moved money through) resolves independently of the file-level
    // identifier above. Exact match only, never the file-level resolution's
    // masked-suffix "possible match" heuristic — that still requires a
    // person to confirm which account it means (Account Resolution delta
    // §11's "never auto-merged"), and there's no per-row UI for that
    // confirmation yet. An unresolved row (no identifier, or one that
    // doesn't exactly match a known account) falls back to the file's own
    // resolution exactly as before — unchanged behavior for every existing
    // adapter, none of which ever set `row.accountIdentifier`.
    const rowAccountId = row.accountIdentifier
      ? findAccountIdByIdentifier(db, profileId, row.accountIdentifier)
      : undefined;

    // An identifier that didn't exact-match becomes its own new-Account
    // proposal (GPay importer delta) instead of quietly deferring to
    // whatever the file's own single default resolved to — the real bug
    // this fixes: a credit-card-routed row landed on the file's default
    // Bank account, its own Liability/CREDIT_CARD identity never surfaced
    // anywhere. Keyed by the raw identifier so every row sharing it (the
    // same real card/account, seen across several GPay rows) collapses
    // into one proposal, same posture `newAccountsByKey` above already
    // has for counterpart accounts.
    let proposedSourceAccountKey: string | null = null;
    if (!rowAccountId && row.accountIdentifier && row.proposedAccountName && row.proposedAccountType && row.proposedAccountClassification) {
      proposedSourceAccountKey = `source:${row.accountIdentifier}`;
      if (!newSourceAccountsByKey.has(proposedSourceAccountKey)) {
        newSourceAccountsByKey.set(proposedSourceAccountKey, {
          key: proposedSourceAccountKey,
          identifier: row.accountIdentifier,
          name: row.proposedAccountName,
          classification: row.proposedAccountClassification,
          accountType: row.proposedAccountType,
        });
      }
    }

    return {
      fileKey,
      date: row.date,
      description: row.description,
      amountMinor: row.amountMinor,
      direction: row.direction,
      reference: row.reference,
      time: row.time,
      counterparty: row.counterparty,
      // A pending new-Account proposal wins over the file's own default —
      // never silently attribute this row to the wrong account while its
      // own proposal is still waiting for approval.
      knownAccountId:
        rowAccountId ??
        (proposedSourceAccountKey ? null : accountResolution.status === "resolved" ? accountResolution.resolvedAccountId : null),
      proposedSourceAccountKey,
      counterAccountId: existingId ?? null,
      counterAccountKey: key,
      possibleDuplicate: null,
    };
  });

  const dates = rows.map((row) => row.date).sort();
  flagPossibleDuplicatesAgainstHistory(db, profileId, candidates, dates[0], dates[dates.length - 1]);

  return {
    source,
    accountResolution,
    candidates,
    newAccounts: [...newAccountsByKey.values()],
    newSourceAccounts: [...newSourceAccountsByKey.values()],
    dateRangeStart: dates[0] ?? null,
    dateRangeEnd: dates[dates.length - 1] ?? null,
    transactionCount: candidates.length,
  };
}

// Cross-source reconciliation against already-committed history (GPay
// importer delta) — mutates `candidates` in place, setting
// `possibleDuplicate` on whichever ones match. Scoped to the accounts
// this batch's own rows actually resolved to and the date range those
// rows span — a fresh import's own candidates are the "import" source,
// committed Postings for the same Accounts/dates are the "committed"
// source, and `findPossibleDuplicates` (shared with the client's own
// within-session check) runs the same way against both. No `time` on the
// committed side (Transactions have never stored one) — degrades exactly
// the way it's designed to whenever one side lacks it.
function flagPossibleDuplicatesAgainstHistory(
  db: Db,
  profileId: string,
  candidates: PreviewCandidate[],
  dateStart: string | undefined,
  dateEnd: string | undefined,
): void {
  if (!dateStart || !dateEnd) return;
  const accountIds = [...new Set(candidates.map((c) => c.knownAccountId).filter((id): id is string => id !== null))];
  if (accountIds.length === 0) return;

  const committed = findPostingsForReconciliation(db, profileId, accountIds, dateStart, dateEnd);

  const importRows = candidates.map((candidate, index) => ({
    id: `import-${index}`,
    sourceKey: "import",
    date: candidate.date,
    amountMinor: candidate.amountMinor,
    direction: candidate.direction,
    accountId: candidate.knownAccountId,
    reference: candidate.reference,
    time: candidate.time,
    counterparty: candidate.counterparty,
  }));
  const committedRows = committed.map((posting, index) => ({
    id: `committed-${index}`,
    sourceKey: "committed",
    date: posting.date,
    amountMinor: Math.abs(posting.units),
    // `ImportDirection` is the *statement's* own vocabulary (§ ImportDirection's
    // own doc comment) — a "debit" row means money left the known account,
    // which `buildPostingAmounts` persists as a *negative* `units` on that
    // account's own Posting (`known: { debit: 0, credit: amountMinor }`).
    // Positive units is the credit-direction case, inverted from what the
    // sign might suggest at a glance.
    direction: (posting.units < 0 ? "debit" : "credit") as ImportDirection,
    accountId: posting.accountId,
    reference: posting.reference ?? undefined,
    counterparty: posting.counterparty ?? undefined,
  }));

  const matches = findPossibleDuplicates([...importRows, ...committedRows]);
  const matchByImportId = new Map(matches.filter((m) => m.id.startsWith("import-")).map((m) => [m.id, m.reason]));

  importRows.forEach((row, index) => {
    const reason = matchByImportId.get(row.id);
    if (reason) candidates[index]!.possibleDuplicate = reason;
  });
}

export interface PreviewCustomXlsImportInput {
  profileId: string;
  filename: string;
  fileBase64: string;
  fileKey: string;
  mapping: ColumnMapping;
}

// Custom Importer, XLS path — the user has already confirmed a column
// mapping (via `readRawXlsTable` below feeding the client's mapping form);
// this just applies it and joins the same account-resolution/candidate-
// building path every other import source uses.
export async function previewCustomXlsImport(db: Db, input: PreviewCustomXlsImportInput): Promise<ImportPreview> {
  const currency = findCurrenciesByProfile(db, input.profileId)[0];
  if (!currency) {
    throw new NotFoundError(`No currency configured for profile ${input.profileId}`);
  }

  const buffer = Buffer.from(input.fileBase64, "base64");
  const table = readRawXlsTable(buffer);
  const rows = buildRowsFromMapping(table, input.mapping, currency.minorUnitScale);
  if (rows.length === 0) {
    throw new UnsupportedImportFormatError("no importable rows found with this column mapping");
  }

  return buildPreviewFromRows(db, input.profileId, input.fileKey, "custom.xls.manual", rows, null, "Account");
}

export interface PreviewCustomPdfImportInput {
  profileId: string;
  filename: string;
  fileBase64: string;
  fileKey: string;
  pages: PdfCropPage[];
  mapping: ColumnMapping;
  password?: string;
}

// Custom Importer, PDF path — same shape as the XLS path above, fed by a
// user-drawn crop per selected page instead of a whole spreadsheet.
export async function previewCustomPdfImport(db: Db, input: PreviewCustomPdfImportInput): Promise<ImportPreview> {
  const currency = findCurrenciesByProfile(db, input.profileId)[0];
  if (!currency) {
    throw new NotFoundError(`No currency configured for profile ${input.profileId}`);
  }

  const buffer = Buffer.from(input.fileBase64, "base64");
  const table = await extractCroppedTable(buffer, input.pages, input.password);
  const rows = buildRowsFromMapping(table, input.mapping, currency.minorUnitScale);
  if (rows.length === 0) {
    throw new UnsupportedImportFormatError("no importable rows found with this crop/column mapping");
  }

  return buildPreviewFromRows(db, input.profileId, input.fileKey, "custom.pdf.manual", rows, null, "Account");
}

// Thin wrapper so the client's XLS mapping-step round-trip (fetch a
// RawTable to build the ColumnMappingForm's preview + suggested mapping,
// before the user has confirmed one yet) doesn't need to reach past this
// service layer into `readXlsRows` directly.
export function readRawXlsTable(buffer: Buffer): RawTable {
  const rows = readXlsRows(buffer);
  return { rows, headerRowIndex: rows.length > 0 ? 0 : null };
}

// Wraps customImportMapping.ts's `suggestColumnMapping` so the action/core
// layer only ever imports from this one service module for every Custom
// Importer concern, same as every other import path here.
export function suggestMappingFor(table: RawTable): Partial<ColumnMapping> {
  return suggestColumnMapping(table);
}

// The PDF page-selector's own round-trip (how many pages exist, before any
// crop is drawn) and the crop editor's own round-trip (what a proposed
// crop actually extracts, before the user has confirmed a column mapping
// yet) — thin wrappers over `pdfTextExtraction.ts`, kept in this service
// layer rather than reached directly from the action/core layer, same
// convention every other import path in this file follows.
export function getPdfPageCount(buffer: Buffer, password?: string): Promise<number> {
  return getPageCount(buffer, password);
}

export function extractPdfCropPreview(
  buffer: Buffer,
  pages: PdfCropPage[],
  password?: string,
): Promise<RawTable> {
  return extractCroppedTable(buffer, pages, password);
}

// Statement direction always maps to the same Posting sides regardless of
// the known Account's classification (docs/03-accounting-principles.md):
// an outflow (statement "debit") credits the known Account and debits the
// counter-Account; an inflow (statement "credit") does the reverse. This
// holds for both Asset accounts (an outflow decreases the debit-normal
// balance = credit) and Liability accounts (an outflow — e.g. a card
// charge — increases the credit-normal balance = also credit). Reaffirmed
// unchanged by the Import Workflow delta's own §6 examples, including the
// credit-card-credit case.
function buildPostingAmounts(direction: ImportDirection, amountMinor: number) {
  return direction === "debit"
    ? { known: { debit: 0, credit: amountMinor }, counter: { debit: amountMinor, credit: 0 } }
    : { known: { debit: amountMinor, credit: 0 }, counter: { debit: 0, credit: amountMinor } };
}

// The source-account resolution the user confirmed for this file (Account
// Resolution delta §2's "Identified Accounts" section) — mirrors
// `NewAccountDescriptor`'s existing-or-new shape for counterpart accounts,
// but for the known/source side, and never restricted to Expense/Income.
export type AccountChoice =
  | { type: "existing"; accountId: string }
  | { type: "new"; name: string; classification: "ASSET" | "LIABILITY"; accountType: AccountType };

export interface CommitImportFile {
  fileKey: string;
  filename: string;
  source: string;
  // The identifier the adapter detected for this file (echoed back from
  // preview) — used to store/learn AccountIdentifier rows at commit. Null
  // for sources with no statement-derived identity (generic CSV).
  identifier: string | null;
  accountChoice: AccountChoice;
}

export interface CommitImportInput {
  profileId: string;
  files: CommitImportFile[];
  candidates: PreviewCandidate[];
  approvedNewAccounts: NewAccountDescriptor[];
  // GPay importer delta — mirrors `approvedNewAccounts`, but for per-row
  // source-Account proposals (`PreviewCandidate.proposedSourceAccountKey`).
  approvedNewSourceAccounts: NewSourceAccountDescriptor[];
}

function buildIdentifierRow(accountId: string, identifier: string, now: string): AccountIdentifierRow {
  return { id: crypto.randomUUID(), accountId, identifier, createdAt: now, updatedAt: now };
}

// The only write path (delta §9/§12/§13). One `db.transaction()`: any
// approved counterpart accounts, every file's resolved/created source
// account (+ its AccountIdentifier rows), every file's own ImportFile row,
// and every committed Transaction+Postings across every file all succeed
// or fail together. Returns one ImportFileRow per file that ended up with
// at least one candidate (a file whose every candidate the user removed
// produces no row — nothing to record provenance for).
export function commitImport(db: Db, input: CommitImportInput): ImportFileRow[] {
  if (input.candidates.length === 0) {
    throw new UnsupportedImportFormatError("no candidates to commit");
  }

  const now = new Date().toISOString();

  return db.transaction((tx) => {
    const existingAccounts = findAccountsByProfile(tx, input.profileId);
    const createdCounterAccountIds = new Map<string, string>();

    if (input.approvedNewAccounts.length > 0) {
      // Counterpart catch-alls share the profile's own currency (MVP is
      // single-currency-per-profile, rule #7).
      const currency = findCurrenciesByProfile(tx, input.profileId)[0];
      if (!currency) {
        throw new NotFoundError(`No currency configured for profile ${input.profileId}`);
      }

      for (const descriptor of input.approvedNewAccounts) {
        const alreadyExists = findExistingCounterAccountId(existingAccounts, descriptor.classification, descriptor.name);
        if (alreadyExists || createdCounterAccountIds.has(descriptor.key)) continue;

        const newAccountInput: CreateAccountInput = {
          profileId: input.profileId,
          currencyId: currency.id,
          name: descriptor.name,
          classification: descriptor.classification,
          // Same default bucket as the accountType backfill migration
          // (Expense -> Variable, Income -> Earned) — individually
          // re-classifiable afterward via the normal Account edit form.
          accountType: descriptor.classification === "EXPENSE" ? "VARIABLE" : "EARNED",
        };
        const created = createAccount(tx, newAccountInput);
        createdCounterAccountIds.set(descriptor.key, created.id);
      }
    }

    function resolveCounterAccountId(candidate: PreviewCandidate): string {
      const resolved = candidate.counterAccountId ?? createdCounterAccountIds.get(candidate.counterAccountKey);
      if (!resolved) {
        throw new NotFoundError(
          `Counter account "${candidate.counterAccountKey}" was not found and was not approved for creation`,
        );
      }
      return resolved;
    }

    // GPay importer delta — a per-row source-Account proposal, approved
    // the same way an approved counterpart is: created once per distinct
    // key, every row sharing that key resolves to the one created Account.
    // Also learns the identifier that produced the proposal in the first
    // place (+ its masked variants), same as a file-level "new" choice
    // does below — the next statement showing this same card/account
    // resolves directly instead of proposing it all over again.
    const createdSourceAccountIds = new Map<string, string>();
    if (input.approvedNewSourceAccounts.length > 0) {
      const currency = findCurrenciesByProfile(tx, input.profileId)[0];
      if (!currency) {
        throw new NotFoundError(`No currency configured for profile ${input.profileId}`);
      }

      for (const descriptor of input.approvedNewSourceAccounts) {
        if (createdSourceAccountIds.has(descriptor.key)) continue;

        const created = createAccount(tx, {
          profileId: input.profileId,
          currencyId: currency.id,
          name: descriptor.name,
          classification: descriptor.classification,
          accountType: descriptor.accountType,
        });
        createdSourceAccountIds.set(descriptor.key, created.id);
        insertAccountIdentifier(tx, buildIdentifierRow(created.id, descriptor.identifier, now));
        for (const variant of deriveIdentifierVariants(descriptor.identifier)) {
          insertAccountIdentifier(tx, buildIdentifierRow(created.id, variant, now));
        }
      }
    }

    function resolveSourceAccountId(candidate: PreviewCandidate, fileDefaultAccountId: string): string {
      if (candidate.knownAccountId) return candidate.knownAccountId;
      if (candidate.proposedSourceAccountKey) {
        const resolved = createdSourceAccountIds.get(candidate.proposedSourceAccountKey);
        if (!resolved) {
          throw new NotFoundError(
            `Source account "${candidate.proposedSourceAccountKey}" was not found and was not approved for creation`,
          );
        }
        return resolved;
      }
      return fileDefaultAccountId;
    }

    const candidatesByFileKey = new Map<string, PreviewCandidate[]>();
    for (const candidate of input.candidates) {
      const list = candidatesByFileKey.get(candidate.fileKey) ?? [];
      list.push(candidate);
      candidatesByFileKey.set(candidate.fileKey, list);
    }

    const knownIdentifiers = findAccountIdentifiersByProfile(tx, input.profileId);
    const knownIdentifiersByAccountId = new Map<string, Set<string>>();
    for (const row of knownIdentifiers) {
      const set = knownIdentifiersByAccountId.get(row.accountId) ?? new Set<string>();
      set.add(row.identifier);
      knownIdentifiersByAccountId.set(row.accountId, set);
    }

    const allTransactionRows: TransactionRow[] = [];
    const pendingPostingsByTransactionId = new Map<string, PostingInput[]>();
    const accountIdsToValidate = new Set<string>();
    const fileRows: ImportFileRow[] = [];

    for (const file of input.files) {
      const fileCandidates = candidatesByFileKey.get(file.fileKey) ?? [];
      if (fileCandidates.length === 0) continue;

      let resolvedAccountId: string;
      let newAccountCount = 0;

      if (file.accountChoice.type === "new") {
        const currency = findCurrenciesByProfile(tx, input.profileId)[0];
        if (!currency) {
          throw new NotFoundError(`No currency configured for profile ${input.profileId}`);
        }
        const created = createAccount(tx, {
          profileId: input.profileId,
          currencyId: currency.id,
          name: file.accountChoice.name,
          classification: file.accountChoice.classification,
          accountType: file.accountChoice.accountType,
        });
        resolvedAccountId = created.id;
        newAccountCount = 1;
        if (file.identifier) {
          insertAccountIdentifier(tx, buildIdentifierRow(created.id, file.identifier, now));
          for (const variant of deriveIdentifierVariants(file.identifier)) {
            insertAccountIdentifier(tx, buildIdentifierRow(created.id, variant, now));
          }
        }
      } else {
        resolvedAccountId = file.accountChoice.accountId;
        // User-approved identifier learning (§14): an existing account
        // gains this newly-observed identifier if it didn't already know
        // it, so future statements showing it resolve directly.
        if (file.identifier && !knownIdentifiersByAccountId.get(resolvedAccountId)?.has(file.identifier)) {
          insertAccountIdentifier(tx, buildIdentifierRow(resolvedAccountId, file.identifier, now));
        }
      }

      const importFileId = crypto.randomUUID();
      let inflowMinor = 0;
      let outflowMinor = 0;

      for (const candidate of fileCandidates) {
        const knownAccountId = resolveSourceAccountId(candidate, resolvedAccountId);
        const counterAccountId = resolveCounterAccountId(candidate);
        const amounts = buildPostingAmounts(candidate.direction, candidate.amountMinor);
        const transactionId = crypto.randomUUID();

        if (candidate.direction === "credit") inflowMinor += candidate.amountMinor;
        else outflowMinor += candidate.amountMinor;

        allTransactionRows.push({
          id: transactionId,
          profileId: input.profileId,
          date: candidate.date,
          description: candidate.description,
          tags: null,
          importFileId,
          // GPay importer delta — kept for a *future* import to check
          // against this Transaction once it's committed history
          // (`findTransactionsForReconciliation`); never read back for
          // anything Ledger-facing itself.
          reference: candidate.reference ?? null,
          counterparty: candidate.counterparty ?? null,
          createdAt: now,
          updatedAt: now,
        });
        pendingPostingsByTransactionId.set(transactionId, [
          { accountId: knownAccountId, debit: amounts.known.debit, credit: amounts.known.credit },
          { accountId: counterAccountId, debit: amounts.counter.debit, credit: amounts.counter.credit },
        ]);
        accountIdsToValidate.add(knownAccountId);
        accountIdsToValidate.add(counterAccountId);
      }

      const dates = fileCandidates.map((candidate) => candidate.date).sort();
      fileRows.push({
        id: importFileId,
        profileId: input.profileId,
        filename: file.filename,
        source: file.source,
        status: "successful",
        accountId: resolvedAccountId,
        newAccountCount,
        inflowMinor,
        outflowMinor,
        dateRangeStart: dates[0] ?? null,
        dateRangeEnd: dates[dates.length - 1] ?? null,
        transactionCount: fileCandidates.length,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (fileRows.length === 0) {
      throw new UnsupportedImportFormatError("no candidates to commit");
    }

    const accountRefs = findAccountRefs(tx, [...accountIdsToValidate]);
    const baseCurrency = resolveBaseCurrency(tx, input.profileId);
    const allPostingRows: PostingRow[] = [];
    for (const transactionRow of allTransactionRows) {
      const legs = pendingPostingsByTransactionId.get(transactionRow.id) ?? [];
      const derivedPostings = derivePostings(tx, legs, accountRefs, baseCurrency, transactionRow.date);
      const violations = validateTransaction(
        { profileId: input.profileId, postings: derivedPostings },
        accountRefs,
        baseCurrency,
      );
      if (violations.length > 0) {
        throw new TransactionValidationError(violations);
      }
      for (const posting of derivedPostings) {
        allPostingRows.push({
          id: crypto.randomUUID(),
          transactionId: transactionRow.id,
          accountId: posting.accountId,
          units: posting.units,
          priceNum: posting.priceNum,
          priceDenom: posting.priceDenom,
          baseAmount: posting.baseAmount,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const row of fileRows) insertImportFile(tx, row);
    for (const transactionRow of allTransactionRows) insertTransaction(tx, transactionRow);
    insertPostings(tx, allPostingRows);

    return fileRows;
  });
}

export function listImports(db: Db, profileId: string): ImportFileRow[] {
  return findImportFilesByProfile(db, profileId);
}
