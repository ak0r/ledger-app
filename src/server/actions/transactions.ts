"use server";

import { getFamilyDb } from "../db/family-client";
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
  return createTransactionCore(getFamilyDb(familyId), input);
}

export async function editTransactionAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  return editTransactionCore(getFamilyDb(familyId), input);
}

export async function deleteTransactionAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return deleteTransactionCore(getFamilyDb(familyId), input);
}

export async function mergeTransactionsAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<TransactionWithPostings>> {
  return mergeTransactionsCore(getFamilyDb(familyId), input);
}

export async function bulkDeleteTransactionsAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return bulkDeleteTransactionsCore(getFamilyDb(familyId), input);
}

export async function bulkUpdateTagsAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return bulkUpdateTagsCore(getFamilyDb(familyId), input);
}
