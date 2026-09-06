"use server";

import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { TransactionWithPostings } from "../services/transactions";
import {
  bulkDeleteTransactionsCore,
  bulkUpdateTagsCore,
  createTransactionCore,
  deleteTransactionCore,
  editTransactionCore,
  mergeTransactionsCore,
} from "./transactions.core";
import type { ActionResult } from "./result";

export async function createTransactionAction(
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  const { profile } = await requireActiveProfile();
  return createTransactionCore(db, { ...(input as object), profileId: profile.id });
}

export async function editTransactionAction(
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  const { profile } = await requireActiveProfile();
  return editTransactionCore(db, { ...(input as object), profileId: profile.id });
}

export async function deleteTransactionAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  return deleteTransactionCore(db, { ...(input as object), profileId: profile.id });
}

export async function mergeTransactionsAction(
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  const { profile } = await requireActiveProfile();
  return mergeTransactionsCore(db, { ...(input as object), profileId: profile.id });
}

export async function bulkDeleteTransactionsAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  return bulkDeleteTransactionsCore(db, { ...(input as object), profileId: profile.id });
}

export async function bulkUpdateTagsAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  return bulkUpdateTagsCore(db, { ...(input as object), profileId: profile.id });
}
