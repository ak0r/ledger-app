"use server";

import { requireFamilyDb } from "../authz";
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
  familyId: string,
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  return createTransactionCore(await requireFamilyDb(familyId), input);
}

export async function editTransactionAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  return editTransactionCore(await requireFamilyDb(familyId), input);
}

export async function deleteTransactionAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return deleteTransactionCore(await requireFamilyDb(familyId), input);
}

export async function mergeTransactionsAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  return mergeTransactionsCore(await requireFamilyDb(familyId), input);
}

export async function bulkDeleteTransactionsAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return bulkDeleteTransactionsCore(await requireFamilyDb(familyId), input);
}

export async function bulkUpdateTagsAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return bulkUpdateTagsCore(await requireFamilyDb(familyId), input);
}
