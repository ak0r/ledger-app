// Active-Member context (resolved 2026-08-15, HANDOFF.md open decisions #3):
// URL-scoped is the source of truth (/m/[memberId]/...); this cookie is
// convenience-only, used to redirect "/" to wherever the user left off.
// Plain module — safe to import from Server Components (read) and from
// src/server/actions/activeMember.ts (write).
import { cookies } from "next/headers";

export const ACTIVE_MEMBER_COOKIE = "activeMemberId";

export async function readActiveMemberIdCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value;
}
