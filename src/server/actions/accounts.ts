"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { requireProfileAccess } from "../authz";
import type { AccountRow } from "../repositories/accounts";
import {
  archiveAccountCore,
  bulkArchiveAccountsCore,
  bulkUpdateAccountTagsCore,
  createAccountCore,
  editAccountCore,
} from "./accounts.core";
import type { ActionResult } from "./result";

export async function createAccountAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<AccountRow>> {
  await requireProfileAccess(profileId);
  return createAccountCore(db, input);
}

export async function editAccountAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<AccountRow>> {
  await requireProfileAccess(profileId);
  return editAccountCore(db, input);
}

// Zero-JS: bind(null, profileId, accountId) from a plain <form> next to
// each row in the accounts list — no client-side state needed for a
// one-click action. Ownership is already re-checked inside
// archiveAccountCore (rule #6); this only surfaces a truly unexpected
// failure.
export async function archiveAccountAction(profileId: string, accountId: string): Promise<void> {
  await requireProfileAccess(profileId);
  const result = archiveAccountCore(db, { profileId, accountId });
  if (!result.success) throw new Error(result.error);
  revalidatePath(`/p/${profileId}/accounts`);
}

// Same two-arg (profileId, input) shape as the bulk Transaction actions —
// called from a client component (AccountBulkActionBar) that does its own
// `router.refresh()` on success, unlike the zero-JS single-row archive
// action above.
export async function bulkArchiveAccountsAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  await requireProfileAccess(profileId);
  return bulkArchiveAccountsCore(db, input);
}

export async function bulkUpdateAccountTagsAction(
  profileId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  await requireProfileAccess(profileId);
  return bulkUpdateAccountTagsCore(db, input);
}
