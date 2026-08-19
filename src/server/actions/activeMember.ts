"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getFamilyDb } from "../db/family-client";
import { ACTIVE_MEMBER_COOKIE } from "../activeMember";
import type { MemberRow } from "../repositories/members";
import { setPrimaryMember } from "../use-cases/members";
import { createMemberCore } from "./members.core";
import type { ActionResult } from "./result";

async function setActiveMemberCookie(memberId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_MEMBER_COOKIE, memberId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
}

// Onboarding: create a Member (within the given Family's isolated dataset),
// make it the active one, and navigate to its dashboard. On validation/
// domain failure, returns the ActionResult instead of redirecting so the
// calling form can show the error inline.
export async function createMemberAndActivateAction(
  familyId: string,
  input: unknown,
): Promise<ActionResult<MemberRow>> {
  const result = createMemberCore(getFamilyDb(familyId), input);
  if (result.success) {
    await setActiveMemberCookie(result.data.id);
    redirect(`/f/${familyId}/m/${result.data.id}`);
  }
  return result;
}

// Zero-JS member switcher: bind(null, familyId, memberId) from a plain
// <form> in the member picker. Existence is re-checked by
// /f/[familyId]/m/layout.tsx on the next request, so a bogus id just
// bounces back to the Member picker — no need to duplicate that check here.
export async function activateMemberAction(familyId: string, memberId: string): Promise<void> {
  await setActiveMemberCookie(memberId);
  redirect(`/f/${familyId}/m/${memberId}`);
}

// Finalizes initial Family setup (docs/onboarding.md §7): marks the chosen
// Member as Primary — auto-selected when there's only one, explicitly
// picked by the user when there are several — activates it, and enters the
// app. Only reachable from the Members page while no Member is primary yet
// (see /f/[familyId]/members); existence is re-checked by setPrimaryMember
// itself (throws NotFoundError for a bogus id, same as every other
// Member-scoped use-case).
async function finalizePrimaryMember(familyId: string, memberId: string): Promise<void> {
  setPrimaryMember(getFamilyDb(familyId), memberId);
  await setActiveMemberCookie(memberId);
  redirect(`/f/${familyId}/m/${memberId}`);
}

// Single-Member case: id is already known, zero-JS
// bind(null, familyId, memberId) from a plain "Continue" <form>.
export async function finalizePrimaryMemberAction(
  familyId: string,
  memberId: string,
): Promise<void> {
  await finalizePrimaryMember(familyId, memberId);
}

// Multi-Member case: bind(null, familyId) from a plain <form> whose radio
// inputs share name="memberId" — the selection is only known at submit
// time, so it comes through FormData instead of a pre-bound argument.
export async function finalizePrimaryMemberFromFormAction(
  familyId: string,
  formData: FormData,
): Promise<void> {
  const memberId = formData.get("memberId");
  if (typeof memberId !== "string" || !memberId) {
    throw new Error("Choose a primary Member");
  }
  await finalizePrimaryMember(familyId, memberId);
}
