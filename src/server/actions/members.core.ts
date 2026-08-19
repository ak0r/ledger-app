// Testable core: takes `db` explicitly, no Next.js runtime involved. The
// dedicated "use server" file next to this one binds the real connection
// singleton and is the only thing Client Components import (Phase 6).
import type { Db } from "../db/family-client";
import type { MemberRow } from "../repositories/members";
import { createMember } from "../use-cases/members";
import { createMemberSchema } from "./schemas";
import { fromThrown, invalidInput, ok, type ActionResult } from "./result";

export function createMemberCore(db: Db, input: unknown): ActionResult<MemberRow> {
  const parsed = createMemberSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return ok(createMember(db, parsed.data));
  } catch (error) {
    return fromThrown(error);
  }
}
