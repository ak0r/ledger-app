import {
  validateTransaction,
  computeBaseAmounts,
  decimalRateToMinorRational,
  makeRational,
  multiplyRationalByInt,
  roundHalfEvenToInt,
  type AccountRef,
  type BaseCurrency,
  type Rational,
  type PostingInput as DomainPostingInput,
} from "@/core";
import { matchesFilter, type TransactionFilterState } from "@/lib/transaction-filter";
import { checkMergeEligibility } from "@/lib/merge-eligibility";
import type { Db, DbOrTx } from "../persistence/client";
import { findAccountRefs, findAccountsByProfile, type AccountRow } from "../repositories/accounts";
import { findCurrencyById } from "../repositories/currencies";
import { findProfileById } from "../repositories/profiles";
import { resolveCurrencyRate } from "./currencyRates";
import {
  deletePostingsByTransaction,
  deleteTransactionRow,
  findPostingsByTransaction,
  findPostingsByTransactionIds,
  findTransactionById,
  findTransactionsByProfile,
  insertPostings,
  insertTransaction,
  updateTransactionFields,
  type PostingRow,
  type TransactionRow,
} from "../repositories/transactions";
import { MergeIneligibleError, NoBaseCurrencyError, NotFoundError, TransactionValidationError } from "./errors";

export interface PostingInput {
  accountId: string;
  debit: number;
  credit: number;
  // Transaction Form FX UX delta — the standard one-unit quotation ("1 JPY
  // = 0.5800 INR"), confirmed by the user, for a posting whose Account
  // currency differs from the Base Currency. Omitted for a same-currency
  // posting, or to let the server fall back to the CurrencyRate default
  // for this Transaction's own date (`resolveCurrencyRate`).
  rateDecimal?: number;
}

export interface TransactionWithPostings extends TransactionRow {
  postings: PostingRow[];
}

type DerivedPosting = DomainPostingInput;

function buildPostingRows(
  transactionId: string,
  postingInputs: readonly DerivedPosting[],
  now: string,
): PostingRow[] {
  return postingInputs.map((posting) => ({
    id: crypto.randomUUID(),
    transactionId,
    accountId: posting.accountId,
    units: posting.units,
    priceNum: posting.priceNum,
    priceDenom: posting.priceDenom,
    baseAmount: posting.baseAmount,
    createdAt: now,
    updatedAt: now,
  }));
}

// Resolves the Profile's Base Currency (`primaryCurrencyId`) — every
// Transaction's `base_amount` reconciles against this fixed target (Account
// Types, Money Representation, Rational Pricing, FX & Liability Details
// delta), replacing the old "whichever leg is credit side" dynamic rule.
export function resolveBaseCurrency(db: DbOrTx, profileId: string): BaseCurrency {
  const profile = findProfileById(db, profileId);
  const currency = profile?.primaryCurrencyId
    ? findCurrencyById(db, profile.primaryCurrencyId, profileId)
    : undefined;
  if (!currency) {
    throw new NoBaseCurrencyError();
  }
  return { id: currency.id, code: currency.code, scale: currency.minorUnitScale };
}

function naiveBaseAmount(units: number, price: Rational): number {
  const exact = multiplyRationalByInt(units, price);
  return roundHalfEvenToInt(exact.num, exact.denom);
}

// Derives the domain layer's exact-rational fields for every posting,
// alongside the legacy quantity/price ones (kept byte-for-byte identical
// to before — see DerivedPosting). The use-case layer's own PostingInput
// ({accountId, debit, credit, rateDecimal?}) stays the source of truth for
// direction/amount; `rateDecimal` (Transaction Form FX UX delta) is the
// user-confirmed one-unit quotation for a posting whose Account currency
// differs from the Base Currency, falling back to `resolveCurrencyRate`'s
// own default (for this Transaction's own `date`) when omitted. No
// currency-count restriction — any number of independently-priced
// non-Base-Currency legs is domain-valid now.
//
// Rounding + residual ownership: every leg's `baseAmount` is first computed
// *independently* (its own units × its own price, half-even rounded) —
// including the one credit-side ("From") primary leg, using its own price
// the exact same way. If every leg turns out to be exactly the Base
// Currency (no real FX in play at all), that's the final answer, unchanged
// from before this step — the same protection that already caught a real
// same-currency data-entry mismatch (debit 2000 / credit 1900) stays
// intact. Only when at least one leg is genuinely priced against a
// non-1/1 rate does `computeBaseAmounts`' residual-ownership rule
// (core/ledger/transactions/baseAmount.ts) get a chance to run — and even
// then, only if the residual it would land on the primary leg is small
// (bounded by the number of other legs — half-even rounding can never be
// off by more than 0.5 minor unit per leg). A larger residual means the
// entered amounts and rates simply don't reconcile — falls back to the
// independent computation instead, so `validateTransaction`'s SUM === 0
// check honestly rejects it as UNBALANCED rather than silently absorbing
// an arbitrary mismatch into whatever the primary leg's own amount was
// (a real gap: a naive "always use CurrencyRate parity when unset" fallback
// can be wildly wrong for an account with no rate history at all, and must
// never be trusted blindly).
export function derivePostings(
  db: DbOrTx,
  postingInputs: readonly PostingInput[],
  accounts: ReadonlyMap<string, AccountRef>,
  baseCurrency: BaseCurrency,
  date: string,
): DerivedPosting[] {
  const primaryIndex = postingInputs.findIndex((posting) => posting.credit > 0);

  const legs = postingInputs.map((posting) => {
    const account = accounts.get(posting.accountId);
    const units = posting.debit - posting.credit;

    const price: Rational =
      !account || account.currencyCode === baseCurrency.code
        ? makeRational(1, 1)
        : posting.rateDecimal !== undefined
          ? decimalRateToMinorRational(posting.rateDecimal, account.currencyScale, baseCurrency.scale)
          : resolveCurrencyRate(db, account.currencyId, baseCurrency.id, date);

    return { accountId: posting.accountId, units, price };
  });

  const naiveBaseAmounts = legs.map((leg) => naiveBaseAmount(leg.units, leg.price));
  const hasGenuineFx = legs.some((leg) => leg.price.num !== leg.price.denom);

  let baseAmounts = naiveBaseAmounts;
  if (hasGenuineFx && primaryIndex !== -1) {
    const residualBaseAmounts = computeBaseAmounts(
      legs.map((leg) => ({ units: leg.units, price: leg.price })),
      primaryIndex,
    );
    // Bounded trust: at most one minor unit of legitimate rounding noise
    // per non-primary leg — anything beyond that means the entered
    // amounts/rates don't actually reconcile, not that there's rounding to
    // absorb.
    const tolerance = legs.length - 1;
    if (Math.abs(residualBaseAmounts[primaryIndex]! - naiveBaseAmounts[primaryIndex]!) <= tolerance) {
      baseAmounts = residualBaseAmounts;
    }
  }

  return legs.map((leg, index) => ({
    accountId: leg.accountId,
    units: leg.units,
    priceNum: leg.price.num,
    priceDenom: leg.price.denom,
    baseAmount: baseAmounts[index]!,
  }));
}

// Validates against the Phase 3 domain layer before touching the DB (rule
// #17) — this is the real enforcement point, independent of any UI/Zod
// checks that may also run at the Phase 5 API boundary.
function assertBalanced(
  db: Db,
  profileId: string,
  postingInputs: readonly PostingInput[],
  date: string,
): DerivedPosting[] {
  const accountIds = postingInputs.map((posting) => posting.accountId);
  const accounts = findAccountRefs(db, accountIds);
  const baseCurrency = resolveBaseCurrency(db, profileId);
  const derivedPostings = derivePostings(db, postingInputs, accounts, baseCurrency, date);
  const violations = validateTransaction({ profileId, postings: derivedPostings }, accounts, baseCurrency);
  if (violations.length > 0) {
    throw new TransactionValidationError(violations);
  }
  return derivedPostings;
}

export interface CreateTransactionInput {
  profileId: string;
  date: string;
  description: string;
  tags?: string[];
  postings: PostingInput[];
}

export function createTransaction(
  db: Db,
  input: CreateTransactionInput,
): TransactionWithPostings {
  const derivedPostings = assertBalanced(db, input.profileId, input.postings, input.date);

  const now = new Date().toISOString();
  const transaction: TransactionRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    date: input.date,
    description: input.description,
    tags: input.tags ?? null,
    // Manual creation only, never carries Import provenance (delta §4) —
    // import-committed transactions are built directly in
    // use-cases/imports.ts, not through this function.
    importFileId: null,
    createdAt: now,
    updatedAt: now,
  };
  const postingRows = buildPostingRows(transaction.id, derivedPostings, now);

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
  profileId: string;
  date: string;
  description: string;
  tags?: string[];
  postings: PostingInput[];
}

export function editTransaction(
  db: Db,
  input: EditTransactionInput,
): TransactionWithPostings {
  const existing = findTransactionById(db, input.transactionId, input.profileId);
  if (!existing) {
    throw new NotFoundError(
      `Transaction ${input.transactionId} not found for profile ${input.profileId}`,
    );
  }

  const derivedPostings = assertBalanced(db, input.profileId, input.postings, input.date);

  const now = new Date().toISOString();
  const postingRows = buildPostingRows(input.transactionId, derivedPostings, now);
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
  profileId: string;
  transactionIds: string[];
}

export function mergeTransactions(
  db: Db,
  input: MergeTransactionsInput,
): TransactionWithPostings {
  const targets = input.transactionIds.map((transactionId) => {
    const transaction = findTransactionById(db, transactionId, input.profileId);
    if (!transaction) {
      throw new NotFoundError(
        `Transaction ${transactionId} not found for profile ${input.profileId}`,
      );
    }
    return { ...transaction, postings: findPostingsByTransaction(db, transactionId) };
  });

  const accountsById = new Map(
    findAccountsByProfile(db, input.profileId).map((account) => [account.id, account]),
  );
  const eligibility = checkMergeEligibility(targets, accountsById);
  if (!eligibility.eligible) {
    throw new MergeIneligibleError(eligibility.reason ?? "Transactions are not eligible to merge");
  }

  const mergedPostingInputs: PostingInput[] = targets.flatMap((transaction) =>
    transaction.postings.map((posting) => ({
      accountId: posting.accountId,
      debit: posting.units > 0 ? posting.units : 0,
      credit: posting.units < 0 ? -posting.units : 0,
    })),
  );
  const derivedPostings = assertBalanced(db, input.profileId, mergedPostingInputs, targets[0].date);

  const now = new Date().toISOString();
  const descriptions = [...new Set(targets.map((transaction) => transaction.description))];
  const mergedTags = [...new Set(targets.flatMap((transaction) => transaction.tags ?? []))];
  const merged: TransactionRow = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    date: targets[0].date,
    description: descriptions.join(" + "),
    tags: mergedTags.length > 0 ? mergedTags : null,
    // Merging is a manual action; a merged transaction has no single Import
    // to attribute to even if some inputs did (delta §4 doesn't define this
    // case, and merge already isn't offered from the Import flow).
    importFileId: null,
    createdAt: now,
    updatedAt: now,
  };
  const postingRows = buildPostingRows(merged.id, derivedPostings, now);

  db.transaction((tx) => {
    insertTransaction(tx, merged);
    insertPostings(tx, postingRows);
    for (const target of targets) {
      deleteTransactionRow(tx, target.id, input.profileId);
    }
  });

  return { ...merged, postings: postingRows };
}

export interface DeleteTransactionInput {
  transactionId: string;
  profileId: string;
}

// Hard delete (rule #9, ADR-019). Postings cascade at the schema level; the
// transaction wrapper still atomically covers this whole operation.
export function deleteTransaction(db: Db, input: DeleteTransactionInput): void {
  const existing = findTransactionById(db, input.transactionId, input.profileId);
  if (!existing) {
    throw new NotFoundError(
      `Transaction ${input.transactionId} not found for profile ${input.profileId}`,
    );
  }

  db.transaction((tx) => {
    deleteTransactionRow(tx, input.transactionId, input.profileId);
  });
}

export interface BulkDeleteTransactionsInput {
  profileId: string;
  transactionIds: string[];
}

// BulkActionBar's Delete (transactionworkspacedelta.md §12) — same hard
// delete as the single-row path, all-or-nothing: every target is verified
// to exist (and belong to this Profile) before any delete runs, so a
// mismatched id in the selection rejects the whole batch rather than
// deleting some and silently skipping others.
export function bulkDeleteTransactions(db: Db, input: BulkDeleteTransactionsInput): void {
  const targets = input.transactionIds.map((transactionId) => {
    const transaction = findTransactionById(db, transactionId, input.profileId);
    if (!transaction) {
      throw new NotFoundError(
        `Transaction ${transactionId} not found for profile ${input.profileId}`,
      );
    }
    return transaction;
  });

  db.transaction((tx) => {
    for (const target of targets) {
      deleteTransactionRow(tx, target.id, input.profileId);
    }
  });
}

export interface BulkUpdateTagsInput {
  profileId: string;
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
    const transaction = findTransactionById(db, transactionId, input.profileId);
    if (!transaction) {
      throw new NotFoundError(
        `Transaction ${transactionId} not found for profile ${input.profileId}`,
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
  profileId: string,
): TransactionWithPostings | undefined {
  const transaction = findTransactionById(db, transactionId, profileId);
  if (!transaction) return undefined;
  return { ...transaction, postings: findPostingsByTransaction(db, transactionId) };
}

export function listTransactions(db: Db, profileId: string): TransactionWithPostings[] {
  const transactionRows = findTransactionsByProfile(db, profileId);
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
// the per-transaction predicate to it. "Profile" isn't a separate filter
// field: /m/[profileId]/... already scopes everything to one Profile via the
// URL (resolved 2026-08-15, HANDOFF.md open decisions #3).
export function filterTransactions(
  transactions: readonly TransactionWithPostings[],
  accountsById: ReadonlyMap<string, AccountRow>,
  filterState: TransactionFilterState,
): TransactionWithPostings[] {
  return transactions.filter((transaction) => matchesFilter(transaction, accountsById, filterState));
}
