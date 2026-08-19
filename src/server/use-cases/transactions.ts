import { validateTransaction } from "@/domain";
import { matchesFilter, type TransactionFilterState } from "@/lib/transaction-filter";
import { checkMergeEligibility } from "@/lib/merge-eligibility";
import type { Db } from "../db/family-client";
import { findAccountRefs, findAccountsByMember, type AccountRow } from "../repositories/accounts";
import {
  deletePostingsByTransaction,
  deleteTransactionRow,
  findPostingsByTransaction,
  findPostingsByTransactionIds,
  findTransactionById,
  findTransactionsByMember,
  insertPostings,
  insertTransaction,
  updateTransactionFields,
  type PostingRow,
  type TransactionRow,
} from "../repositories/transactions";
import { MergeIneligibleError, NotFoundError, TransactionValidationError } from "./errors";

export interface PostingInput {
  accountId: string;
  debit: number;
  credit: number;
}

export interface TransactionWithPostings extends TransactionRow {
  postings: PostingRow[];
}

function buildPostingRows(
  transactionId: string,
  postingInputs: readonly PostingInput[],
  now: string,
): PostingRow[] {
  return postingInputs.map((posting) => ({
    id: crypto.randomUUID(),
    transactionId,
    accountId: posting.accountId,
    debit: posting.debit,
    credit: posting.credit,
    createdAt: now,
    updatedAt: now,
  }));
}

// Validates against the Phase 3 domain layer before touching the DB (rule
// #17) — this is the real enforcement point, independent of any UI/Zod
// checks that may also run at the Phase 5 API boundary.
function assertBalanced(
  db: Db,
  memberId: string,
  postingInputs: readonly PostingInput[],
): void {
  const accountIds = postingInputs.map((posting) => posting.accountId);
  const accounts = findAccountRefs(db, accountIds);
  const violations = validateTransaction({ memberId, postings: postingInputs }, accounts);
  if (violations.length > 0) {
    throw new TransactionValidationError(violations);
  }
}

export interface CreateTransactionInput {
  memberId: string;
  date: string;
  description: string;
  tags?: string[];
  postings: PostingInput[];
}

export function createTransaction(
  db: Db,
  input: CreateTransactionInput,
): TransactionWithPostings {
  assertBalanced(db, input.memberId, input.postings);

  const now = new Date().toISOString();
  const transaction: TransactionRow = {
    id: crypto.randomUUID(),
    memberId: input.memberId,
    date: input.date,
    description: input.description,
    tags: input.tags ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const postingRows = buildPostingRows(transaction.id, input.postings, now);

  db.transaction((tx) => {
    insertTransaction(tx, transaction);
    insertPostings(tx, postingRows);
  });

  return { ...transaction, postings: postingRows };
}

// Full replace (resolved 2026-08-15, HANDOFF.md open decisions #2): the
// caller always sends the complete new state. This revalidates it from
// scratch via the domain layer — an edit is never trusted just because the
// prior version was balanced — then atomically swaps the old postings for
// the new ones under the same transaction id (ADR-023: no persisted draft,
// so there is no partial state to reconcile).
export interface EditTransactionInput {
  transactionId: string;
  memberId: string;
  date: string;
  description: string;
  tags?: string[];
  postings: PostingInput[];
}

export function editTransaction(
  db: Db,
  input: EditTransactionInput,
): TransactionWithPostings {
  const existing = findTransactionById(db, input.transactionId, input.memberId);
  if (!existing) {
    throw new NotFoundError(
      `Transaction ${input.transactionId} not found for member ${input.memberId}`,
    );
  }

  assertBalanced(db, input.memberId, input.postings);

  const now = new Date().toISOString();
  const postingRows = buildPostingRows(input.transactionId, input.postings, now);
  const updatedFields = {
    date: input.date,
    description: input.description,
    tags: input.tags ?? null,
    updatedAt: now,
  };

  db.transaction((tx) => {
    deletePostingsByTransaction(tx, input.transactionId);
    insertPostings(tx, postingRows);
    updateTransactionFields(tx, input.transactionId, updatedFields);
  });

  return { ...existing, ...updatedFields, postings: postingRows };
}

// Merge N transactions into one (transactionworkspacedelta.md §11). Loads
// the real targets and re-runs checkMergeEligibility server-side — the
// client's own scan (transaction-row-menu.tsx / merge-transactions-dialog.tsx)
// is contextual UI only, never trusted as the enforcement point (rule #17).
// The merged transaction's postings are the literal union of every input's
// own postings — each input already balances on its own, so their union
// balances trivially, no new balance math needed — `assertBalanced` still
// runs before commit anyway, as a hard guarantee rather than an assumption.
// Description: distinct input descriptions joined with " + " (a single
// shared description passes through unchanged); Tags: union, deduplicated —
// neither is specified by the delta doc, flagging this as an interpretation
// call. Insert-then-delete happens inside one `db.transaction()`: if
// anything fails, nothing commits and the originals are untouched (doc
// §11's "if merge fails, all original transactions remain unchanged").
export interface MergeTransactionsInput {
  memberId: string;
  transactionIds: string[];
}

export function mergeTransactions(
  db: Db,
  input: MergeTransactionsInput,
): TransactionWithPostings {
  const targets = input.transactionIds.map((transactionId) => {
    const transaction = findTransactionById(db, transactionId, input.memberId);
    if (!transaction) {
      throw new NotFoundError(
        `Transaction ${transactionId} not found for member ${input.memberId}`,
      );
    }
    return { ...transaction, postings: findPostingsByTransaction(db, transactionId) };
  });

  const accountsById = new Map(
    findAccountsByMember(db, input.memberId).map((account) => [account.id, account]),
  );
  const eligibility = checkMergeEligibility(targets, accountsById);
  if (!eligibility.eligible) {
    throw new MergeIneligibleError(eligibility.reason ?? "Transactions are not eligible to merge");
  }

  const mergedPostingInputs: PostingInput[] = targets.flatMap((transaction) =>
    transaction.postings.map((posting) => ({
      accountId: posting.accountId,
      debit: posting.debit,
      credit: posting.credit,
    })),
  );
  assertBalanced(db, input.memberId, mergedPostingInputs);

  const now = new Date().toISOString();
  const descriptions = [...new Set(targets.map((transaction) => transaction.description))];
  const mergedTags = [...new Set(targets.flatMap((transaction) => transaction.tags ?? []))];
  const merged: TransactionRow = {
    id: crypto.randomUUID(),
    memberId: input.memberId,
    date: targets[0].date,
    description: descriptions.join(" + "),
    tags: mergedTags.length > 0 ? mergedTags : null,
    createdAt: now,
    updatedAt: now,
  };
  const postingRows = buildPostingRows(merged.id, mergedPostingInputs, now);

  db.transaction((tx) => {
    insertTransaction(tx, merged);
    insertPostings(tx, postingRows);
    for (const target of targets) {
      deleteTransactionRow(tx, target.id, input.memberId);
    }
  });

  return { ...merged, postings: postingRows };
}

export interface DeleteTransactionInput {
  transactionId: string;
  memberId: string;
}

// Hard delete (rule #9, ADR-019). Postings cascade at the schema level; the
// transaction wrapper still atomically covers this whole operation.
export function deleteTransaction(db: Db, input: DeleteTransactionInput): void {
  const existing = findTransactionById(db, input.transactionId, input.memberId);
  if (!existing) {
    throw new NotFoundError(
      `Transaction ${input.transactionId} not found for member ${input.memberId}`,
    );
  }

  db.transaction((tx) => {
    deleteTransactionRow(tx, input.transactionId, input.memberId);
  });
}

export interface BulkDeleteTransactionsInput {
  memberId: string;
  transactionIds: string[];
}

// BulkActionBar's Delete (transactionworkspacedelta.md §12) — same hard
// delete as the single-row path, all-or-nothing: every target is verified
// to exist (and belong to this Member) before any delete runs, so a
// mismatched id in the selection rejects the whole batch rather than
// deleting some and silently skipping others.
export function bulkDeleteTransactions(db: Db, input: BulkDeleteTransactionsInput): void {
  const targets = input.transactionIds.map((transactionId) => {
    const transaction = findTransactionById(db, transactionId, input.memberId);
    if (!transaction) {
      throw new NotFoundError(
        `Transaction ${transactionId} not found for member ${input.memberId}`,
      );
    }
    return transaction;
  });

  db.transaction((tx) => {
    for (const target of targets) {
      deleteTransactionRow(tx, target.id, input.memberId);
    }
  });
}

export interface BulkUpdateTagsInput {
  memberId: string;
  transactionIds: string[];
  addTags: string[];
  removeTags: string[];
}

// BulkActionBar's Tags (transactionworkspacedelta.md §12) — reads each
// target's current tags, adds `addTags`, removes `removeTags` (add wins if
// a tag is somehow in both, applied in that order), and writes every result
// back inside one `db.transaction()`. `updateTransactionFields` requires
// date/description alongside tags (it's a full-row field set, not a
// partial patch) — passed straight through unchanged per target.
export function bulkUpdateTags(db: Db, input: BulkUpdateTagsInput): void {
  const targets = input.transactionIds.map((transactionId) => {
    const transaction = findTransactionById(db, transactionId, input.memberId);
    if (!transaction) {
      throw new NotFoundError(
        `Transaction ${transactionId} not found for member ${input.memberId}`,
      );
    }
    return transaction;
  });

  const now = new Date().toISOString();
  const removeSet = new Set(input.removeTags);

  db.transaction((tx) => {
    for (const target of targets) {
      const merged = [...new Set([...(target.tags ?? []), ...input.addTags])].filter(
        (tag) => !removeSet.has(tag),
      );
      updateTransactionFields(tx, target.id, {
        date: target.date,
        description: target.description,
        tags: merged.length > 0 ? merged : null,
        updatedAt: now,
      });
    }
  });
}

export function getTransactionWithPostings(
  db: Db,
  transactionId: string,
  memberId: string,
): TransactionWithPostings | undefined {
  const transaction = findTransactionById(db, transactionId, memberId);
  if (!transaction) return undefined;
  return { ...transaction, postings: findPostingsByTransaction(db, transactionId) };
}

export function listTransactions(db: Db, memberId: string): TransactionWithPostings[] {
  const transactionRows = findTransactionsByMember(db, memberId);
  const postingRows = findPostingsByTransactionIds(
    db,
    transactionRows.map((transaction) => transaction.id),
  );

  const postingsByTransactionId = new Map<string, PostingRow[]>();
  for (const posting of postingRows) {
    const list = postingsByTransactionId.get(posting.transactionId) ?? [];
    list.push(posting);
    postingsByTransactionId.set(posting.transactionId, list);
  }

  return transactionRows.map((transaction) => ({
    ...transaction,
    postings: postingsByTransactionId.get(transaction.id) ?? [],
  }));
}

// Condition-based filter model lives in src/lib/transaction-filter.ts (pure,
// DB-independent, reusable by future Spaces/reports) — this just delegates
// the per-transaction predicate to it. "Member" isn't a separate filter
// field: /m/[memberId]/... already scopes everything to one Member via the
// URL (resolved 2026-08-15, HANDOFF.md open decisions #3).
export function filterTransactions(
  transactions: readonly TransactionWithPostings[],
  accountsById: ReadonlyMap<string, AccountRow>,
  filterState: TransactionFilterState,
): TransactionWithPostings[] {
  return transactions.filter((transaction) => matchesFilter(transaction, accountsById, filterState));
}
