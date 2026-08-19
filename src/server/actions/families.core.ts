// Testable core: takes the registry `db` explicitly, no Next.js runtime
// involved — mirrors members.core.ts one level up (registry, not a Family's
// isolated financial dataset).
import type { RegistryDb } from "../db/registry-client";
import type { FamilyRow } from "../repositories/families";
import { createFamily, renameFamily } from "../use-cases/families";
import { createFamilySchema, renameFamilySchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createFamilyCore(db: RegistryDb, input: unknown): ActionResult<FamilyRow> {
  const parsed = createFamilySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createFamily(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function renameFamilyCore(db: RegistryDb, input: unknown): ActionResult<FamilyRow> {
  const parsed = renameFamilySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(renameFamily(db, parsed.data.familyId, parsed.data.name));
  } catch (error) {
    return fromThrown(error);
  }
}
