"use server";

import { db } from "../db/client";
import { requireProfileAccess } from "../authz";
import type { TransactionWithPostings } from "../use-cases/transactions";
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
  profileId: string,
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  await requireProfileAccess(profileId);
  return createTransactionCore(db, input);
}

export async function editTransactionAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  await requireProfileAccess(profileId);
  return editTransactionCore(db, input);
}

export async function deleteTransactionAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  await requireProfileAccess(profileId);
  return deleteTransactionCore(db, input);
}

export async function mergeTransactionsAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  await requireProfileAccess(profileId);
  return mergeTransactionsCore(db, input);
}

export async function bulkDeleteTransactionsAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  await requireProfileAccess(profileId);
  return bulkDeleteTransactionsCore(db, input);
}

export async function bulkUpdateTagsAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  await requireProfileAccess(profileId);
  return bulkUpdateTagsCore(db, input);
}
