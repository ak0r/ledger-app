import type { Db } from "../db/client";
import type { AppUserRow } from "../repositories/app-users";
import type { SessionRow } from "../repositories/sessions";
import type { ProfileRow } from "../repositories/profiles";
import { loginAppUser, registerAppUser } from "../use-cases/auth";
import { loginAppUserSchema, registerAppUserSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function registerCore(
  db: Db,
  input: unknown,
): ActionResult<{ appUser: AppUserRow; session: SessionRow; profile: ProfileRow }> {
  const parsed = registerAppUserSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(registerAppUser(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}

export function loginCore(
  db: Db,
  input: unknown,
): ActionResult<{ appUser: AppUserRow; session: SessionRow }> {
  const parsed = loginAppUserSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(loginAppUser(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}
