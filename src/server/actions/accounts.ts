"use server";

import { revalidatePath } from "next/cache";
import { db } from "../persistence/client";
import { requireActiveProfile } from "../authz";
import type { AccountRow } from "../repositories/accounts";
import {
  archiveAccountCore,
  bulkArchiveAccountsCore,
  bulkUpdateAccountTagsCore,
  createAccountCore,
  editAccountCore,
} from "./accounts.core";
import type { ActionResult } from "./result";

export async function createAccountAction(input: unknown): Promise<ActionResult<AccountRow>> {
  const { profile } = await requireActiveProfile();
  return createAccountCore(db, { ...(input as object), profileId: profile.id });
}

export async function editAccountAction(input: unknown): Promise<ActionResult<AccountRow>> {
  const { profile } = await requireActiveProfile();
  return editAccountCore(db, { ...(input as object), profileId: profile.id });
}

// Zero-JS: bind(null, accountId) from a plain <form> next to each row in
// the accounts list — no client-side state needed for a one-click action.
// Ownership is already re-checked inside archiveAccountCore (rule #6);
// this only surfaces a truly unexpected failure.
export async function archiveAccountAction(accountId: string): Promise<void> {
  const { profile } = await requireActiveProfile();
  const result = archiveAccountCore(db, { profileId: profile.id, accountId });
  if (!result.success) throw new Error(result.error);
  revalidatePath("/accounts");
}

// Same (input) shape as the bulk Transaction actions — called from a client
// component (AccountBulkActionBar) that does its own `router.refresh()` on
// success, unlike the zero-JS single-row archive action above.
export async function bulkArchiveAccountsAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  return bulkArchiveAccountsCore(db, { ...(input as object), profileId: profile.id });
}

export async function bulkUpdateAccountTagsAction(input: unknown): Promise<ActionResult<null>> {
  const { profile } = await requireActiveProfile();
  return bulkUpdateAccountTagsCore(db, { ...(input as object), profileId: profile.id });
}
