"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, sqlite } from "../persistence/client";
import { requirePrimaryUser } from "../authz";
import { SESSION_COOKIE } from "../session";
import { ACTIVE_PROFILE_COOKIE } from "../activeProfile";
import { resetLedgerCore } from "./reset.core";
import type { ActionResult } from "./result";

// Reset Ledger (§17) — instance-level, Primary User only. Every AppUser,
// Session and Profile is gone afterward (resetLedger empties every table),
// so this AppUser's own session is invalid too — clears both cookies and
// redirects to /register, the same "first ever" entry point a brand-new
// Hosted Instance uses (registerAppUser makes the very first AppUser
// registered the Primary User).
export async function resetLedgerAction(input: unknown): Promise<ActionResult<void>> {
  await requirePrimaryUser();
  const result = resetLedgerCore(db, sqlite, input);
  if (!result.success) return result;

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ACTIVE_PROFILE_COOKIE);
  redirect("/register");
}
