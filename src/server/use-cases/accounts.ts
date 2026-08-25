import { accountBalance } from "@/domain";
import type { Db } from "../db/client";
import { findCurrencyById } from "../repositories/currencies";
import {
  findAccountById,
  findAccountsByProfile,
  findPostingTotalsByProfile,
  insertAccount,
  setAccountArchived,
  updateAccountFields,
  type AccountRow,
} from "../repositories/accounts";
import type { Classification, InstrumentType } from "../db/schema";
import { NotFoundError } from "./errors";

export interface CreateAccountInput {
  profileId: string;
  currencyId: string;
  name: string;
  classification: Classification;
  instrumentType: InstrumentType;
  instrumentId?: string;
  instrumentLabel?: string;
  tags?: string[];
  icon?: string;
  metadata?: string;
}

// No opening-balance field: an opening balance is a normal double-entry
// Transaction (rule #2), not special Account-creation state — represent it
// by posting a Transaction against a Balancing account after creation, the
// same way any other entry is recorded (product-polish pass, superseding
// the earlier V8-CHANGELOG #9/#10 special-cased opening-balance insert).
export function createAccount(db: Db, input: CreateAccountInput): AccountRow {
  const currency = findCurrencyById(db, input.currencyId, input.profileId);
  if (!currency) {
    throw new NotFoundError(
      `Currency ${input.currencyId} not found for profile ${input.profileId}`,
    );
  }

  const now = new Date().toISOString();
  const account: AccountRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    currencyId: input.currencyId,
    name: input.name,
    classification: input.classification,
    instrumentType: input.instrumentType,
    instrumentId: input.instrumentId ?? null,
    instrumentLabel: input.instrumentLabel ?? null,
    tags: input.tags ?? null,
    icon: input.icon ?? null,
    isArchived: false,
    metadata: input.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertAccount(db, account);
  return account;
}

export function listAccounts(db: Db, profileId: string): AccountRow[] {
  return findAccountsByProfile(db, profileId);
}

export function getAccount(db: Db, accountId: string, profileId: string): AccountRow | undefined {
  return findAccountById(db, accountId, profileId);
}

export interface AccountWithBalance extends AccountRow {
  balance: number;
}

// All-time balance per Account, in the account's own normal-balance sense
// (docs/03-accounting-principles.md) — Accounts with no postings default to
// zero rather than being dropped.
export function getAccountBalances(db: Db, profileId: string): AccountWithBalance[] {
  const accountRows = findAccountsByProfile(db, profileId);
  const totalsByAccountId = findPostingTotalsByProfile(db, profileId);

  return accountRows.map((account) => {
    const totals = totalsByAccountId.get(account.id) ?? { totalDebit: 0, totalCredit: 0 };
    return {
      ...account,
      balance: accountBalance(account.classification, totals.totalDebit, totals.totalCredit),
    };
  });
}

export interface EditAccountInput {
  accountId: string;
  profileId: string;
  name: string;
  classification: Classification;
  instrumentType: InstrumentType;
  instrumentId?: string;
  instrumentLabel?: string;
  tags?: string[];
  icon?: string;
  metadata?: string;
}

export function editAccount(db: Db, input: EditAccountInput): AccountRow {
  const existing = findAccountById(db, input.accountId, input.profileId);
  if (!existing) {
    throw new NotFoundError(
      `Account ${input.accountId} not found for profile ${input.profileId}`,
    );
  }

  const now = new Date().toISOString();
  const fields = {
    name: input.name,
    classification: input.classification,
    instrumentType: input.instrumentType,
    instrumentId: input.instrumentId ?? null,
    instrumentLabel: input.instrumentLabel ?? null,
    tags: input.tags ?? null,
    icon: input.icon ?? null,
    metadata: input.metadata ?? null,
    updatedAt: now,
  };
  updateAccountFields(db, input.accountId, input.profileId, fields);
  return { ...existing, ...fields };
}

export interface ArchiveAccountInput {
  accountId: string;
  profileId: string;
}

export function archiveAccount(db: Db, input: ArchiveAccountInput): AccountRow {
  const existing = findAccountById(db, input.accountId, input.profileId);
  if (!existing) {
    throw new NotFoundError(
      `Account ${input.accountId} not found for profile ${input.profileId}`,
    );
  }

  const now = new Date().toISOString();
  setAccountArchived(db, input.accountId, input.profileId, true, now);
  return { ...existing, isArchived: true, updatedAt: now };
}

export interface BulkArchiveAccountsInput {
  profileId: string;
  accountIds: string[];
}

// Accounts list's Bulk Actions "Archive" (product cleanup pass) — same
// all-or-nothing verification-before-mutation posture as Transactions'
// `bulkDeleteTransactions`: every target must exist (and belong to this
// Profile) before any archive runs, so a mismatched id in the selection
// rejects the whole batch rather than archiving some and silently skipping
// others. Archive, not delete — Accounts don't have a delete operation
// (unlike Transactions, rule #9's hard-delete only applies to
// Transactions); archiving is already idempotent (`setAccountArchived`
// just sets the flag), so re-archiving an already-archived Account in the
// same batch is harmless.
export function bulkArchiveAccounts(db: Db, input: BulkArchiveAccountsInput): void {
  const targets = input.accountIds.map((accountId) => {
    const account = findAccountById(db, accountId, input.profileId);
    if (!account) {
      throw new NotFoundError(`Account ${accountId} not found for profile ${input.profileId}`);
    }
    return account;
  });

  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const target of targets) {
      setAccountArchived(tx, target.id, input.profileId, true, now);
    }
  });
}

export interface BulkUpdateAccountTagsInput {
  profileId: string;
  accountIds: string[];
  addTags: string[];
  removeTags: string[];
}

// Accounts list's Bulk Actions "Add/Remove Tags" — mirrors Transactions'
// `bulkUpdateTags` exactly (same add-then-remove order, same one
// `db.transaction()` for every target). `updateAccountFields` requires the
// full editable field set alongside tags (it's a full-row patch, not a
// partial one — same shape `editAccount` already writes), so every other
// field is passed straight through unchanged per target.
export function bulkUpdateAccountTags(db: Db, input: BulkUpdateAccountTagsInput): void {
  const targets = input.accountIds.map((accountId) => {
    const account = findAccountById(db, accountId, input.profileId);
    if (!account) {
      throw new NotFoundError(`Account ${accountId} not found for profile ${input.profileId}`);
    }
    return account;
  });

  const now = new Date().toISOString();
  const removeSet = new Set(input.removeTags);

  db.transaction((tx) => {
    for (const target of targets) {
      const merged = [...new Set([...(target.tags ?? []), ...input.addTags])].filter(
        (tag) => !removeSet.has(tag),
      );
      updateAccountFields(tx, target.id, input.profileId, {
        name: target.name,
        classification: target.classification,
        instrumentType: target.instrumentType,
        instrumentId: target.instrumentId,
        instrumentLabel: target.instrumentLabel,
        tags: merged.length > 0 ? merged : null,
        icon: target.icon,
        metadata: target.metadata,
        updatedAt: now,
      });
    }
  });
}
