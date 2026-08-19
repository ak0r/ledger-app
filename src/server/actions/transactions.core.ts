import type { Db } from "../db/family-client";
import {
  bulkDeleteTransactions,
  bulkUpdateTags,
  createTransaction,
  deleteTransaction,
  editTransaction,
  mergeTransactions,
  type TransactionWithPostings,
} from "../use-cases/transactions";
import {
  bulkDeleteTransactionsSchema,
  bulkUpdateTagsSchema,
  createTransactionSchema,
  deleteTransactionSchema,
  editTransactionSchema,
  mergeTransactionsSchema,
} from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createTransactionCore(
  db: Db,
  input: unknown,
): ActionResult<TransactionWithPostings> {
  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createTransaction(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function editTransactionCore(
  db: Db,
  input: unknown,
): ActionResult<TransactionWithPostings> {
  const parsed = editTransactionSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(editTransaction(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function deleteTransactionCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = deleteTransactionSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    deleteTransaction(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}

export function mergeTransactionsCore(
  db: Db,
  input: unknown,
): ActionResult<TransactionWithPostings> {
  const parsed = mergeTransactionsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(mergeTransactions(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function bulkDeleteTransactionsCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = bulkDeleteTransactionsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    bulkDeleteTransactions(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}

export function bulkUpdateTagsCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = bulkUpdateTagsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    bulkUpdateTags(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}
