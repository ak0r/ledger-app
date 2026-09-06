// Testable core: takes `db` explicitly, no Next.js runtime involved. The
// dedicated "use server" file next to this one binds the real connection
// singleton and is the only thing Client Components import.
import type { Db } from "../persistence/client";
import type { ProfileRow } from "../repositories/profiles";
import { createProfile, renameProfile, setProfilePanValue, setProfilePrimaryCurrency } from "../services/profiles";
import {
  createProfileSchema,
  renameProfileSchema,
  setProfilePanSchema,
  setProfilePrimaryCurrencySchema,
} from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createProfileCore(db: Db, input: unknown): ActionResult<ProfileRow> {
  const parsed = createProfileSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createProfile(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function renameProfileCore(db: Db, input: unknown): ActionResult<ProfileRow> {
  const parsed = renameProfileSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(renameProfile(db, parsed.data.profileId, parsed.data.name));
  } catch (error) {
    return fromThrown(error);
  }
}

export function setProfilePanCore(db: Db, input: unknown): ActionResult<ProfileRow> {
  const parsed = setProfilePanSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(setProfilePanValue(db, parsed.data.profileId, parsed.data.pan));
  } catch (error) {
    return fromThrown(error);
  }
}

export function setProfilePrimaryCurrencyCore(db: Db, input: unknown): ActionResult<ProfileRow> {
  const parsed = setProfilePrimaryCurrencySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(setProfilePrimaryCurrency(db, parsed.data.profileId, parsed.data.currencyId));
  } catch (error) {
    return fromThrown(error);
  }
}
