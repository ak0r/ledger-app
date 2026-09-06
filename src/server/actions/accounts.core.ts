import type { Db } from "../persistence/client";
import type { AccountRow } from "../repositories/accounts";
import {
  archiveAccount,
  bulkArchiveAccounts,
  bulkUpdateAccountTags,
  createAccount,
  editAccount,
} from "../services/accounts";
import {
  archiveAccountSchema,
  bulkArchiveAccountsSchema,
  bulkUpdateAccountTagsSchema,
  createAccountSchema,
  editAccountSchema,
} from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createAccountCore(db: Db, input: unknown): ActionResult<AccountRow> {
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createAccount(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function editAccountCore(db: Db, input: unknown): ActionResult<AccountRow> {
  const parsed = editAccountSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(editAccount(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function archiveAccountCore(db: Db, input: unknown): ActionResult<AccountRow> {
  const parsed = archiveAccountSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(archiveAccount(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function bulkArchiveAccountsCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = bulkArchiveAccountsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    bulkArchiveAccounts(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}

export function bulkUpdateAccountTagsCore(db: Db, input: unknown): ActionResult<null> {
  const parsed = bulkUpdateAccountTagsSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    bulkUpdateAccountTags(db, parsed.data);
    return ok(null);
  } catch (error) {
    return fromThrown(error);
  }
}
