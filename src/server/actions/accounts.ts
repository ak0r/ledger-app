"use server";

import { revalidatePath } from "next/cache";
import { requireFamilyDb } from "../authz";
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
  familyId: string,
  input: unknown,
): Promise<ActionResult<AccountRow>> {
  return createAccountCore(await requireFamilyDb(familyId), input);
}

export async function editAccountAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<AccountRow>> {
  return editAccountCore(await requireFamilyDb(familyId), input);
}

// Zero-JS: bind(null, familyId, memberId, accountId) from a plain <form>
// next to each row in the accounts list — no client-side state needed for a
// one-click action. Ownership is already re-checked inside
// archiveAccountCore (rule #6); this only surfaces a truly unexpected
// failure.
export async function archiveAccountAction(
  familyId: string,
  memberId: string,
  accountId: string,
): Promise<void> {
  const result = archiveAccountCore(await requireFamilyDb(familyId), { memberId, accountId });
  if (!result.success) throw new Error(result.error);
  revalidatePath(`/f/${familyId}/m/${memberId}/accounts`);
}

// Same two-arg (familyId, input) shape as the bulk Transaction actions —
// called from a client component (AccountBulkActionBar) that does its own
// `router.refresh()` on success, unlike the zero-JS single-row archive
// action above.
export async function bulkArchiveAccountsAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return bulkArchiveAccountsCore(await requireFamilyDb(familyId), input);
}

export async function bulkUpdateAccountTagsAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  return bulkUpdateAccountTagsCore(await requireFamilyDb(familyId), input);
}
