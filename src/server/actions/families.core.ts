// Testable core: takes the app db explicitly, no Next.js runtime involved —
// mirrors members.core.ts one level up (app.db, not a Family's isolated
// financial dataset). appUserId is always a plain extra parameter, never
// part of the zod-parsed `input` — it comes from the caller's session, not
// from client-supplied data (never trust ownership from the client).
import type { AppDb } from "../db/app-client";
import type { FamilyRow } from "../repositories/families";
import { createFamily, renameFamily } from "../use-cases/families";
import { createFamilySchema, renameFamilySchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createFamilyCore(db: AppDb, appUserId: string, input: unknown): ActionResult<FamilyRow> {
  const parsed = createFamilySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createFamily(db, appUserId, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function renameFamilyCore(
  db: AppDb,
  appUserId: string,
  input: unknown,
): ActionResult<FamilyRow> {
  const parsed = renameFamilySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(renameFamily(db, appUserId, parsed.data.familyId, parsed.data.name));
  } catch (error) {
    return fromThrown(error);
  }
}
