import { redirect } from "next/navigation";
import { readActiveFamilyIdCookie } from "@/server/activeFamily";
import { readActiveMemberIdCookie } from "@/server/activeMember";
import { appDb } from "@/server/db/app-client";
import { getFamilyDb } from "@/server/db/family-client";
import { getCurrentAppUser } from "@/server/session";
import { getFamily } from "@/server/use-cases/families";
import { resolveFamilyEntryPath } from "@/server/onboarding";

// SQLite is a live local resource, never build-time data — this route must
// never be statically prerendered (docs/06-architecture.md: "SQLite is
// source of truth").
export const dynamic = "force-dynamic";

// "/" is excluded from proxy.ts's matcher (it only covers /families/* and
// /f/*), so it needs its own explicit session check.
//
// Three-tier resolution (docs/v9-delta/family-concept-contract.md): AppUser
// is the outer identity boundary, Family the dataset boundary, Member the
// ownership boundary within it. Family/Member cookies are convenience-only —
// this route only exists to bounce straight to where the user left off, or
// the next picker up when there's nothing to bounce to. Within a Family,
// resolveFamilyEntryPath prefers the Member cookie but falls back to the
// durable Primary Member (docs/onboarding.md §9) rather than only the picker.
export default async function Home() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const activeFamilyId = await readActiveFamilyIdCookie();
  const family = activeFamilyId ? getFamily(appDb, appUser.id, activeFamilyId) : undefined;
  if (!family) redirect("/families");

  const activeMemberId = await readActiveMemberIdCookie();
  redirect(resolveFamilyEntryPath(getFamilyDb(family.id), family.id, activeMemberId));
}
