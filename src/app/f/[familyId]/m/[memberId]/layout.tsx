import { redirect } from "next/navigation";
import { getFamilyDb } from "@/server/db/family-client";
import { appDb } from "@/server/db/app-client";
import { getCurrentAppUser } from "@/server/session";
import { getMember, listMembers } from "@/server/use-cases/members";
import { getFamily, listFamilies } from "@/server/use-cases/families";
import { SidebarNav } from "@/components/sidebar-nav";
import { BottomNav } from "@/components/bottom-nav";
import { AppHeader } from "@/components/app-header";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Active-Member context is URL-scoped (resolved 2026-08-15, HANDOFF.md open
// decisions #3) — every route under here re-derives the Member from the URL,
// never from hidden session state, and re-validates it exists on every
// request (rule #6). The parent /f/[familyId]/layout.tsx has already
// validated the Family exists and belongs to the current AppUser (via
// requireFamilyOwner) on every request under this tree — no duplicate
// ownership check needed here, just the appUser.id for the read-only
// listFamilies/getFamily calls below.
export default async function MemberLayout({
  params,
  children,
}: {
  params: Promise<{ familyId: string; memberId: string }>;
  children: React.ReactNode;
}) {
  const { familyId, memberId } = await params;
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const db = getFamilyDb(familyId);
  const member = getMember(db, memberId);
  if (!member) redirect(`/f/${familyId}/members`);

  const family = getFamily(appDb, appUser.id, familyId);
  const families = listFamilies(appDb, appUser.id);
  const members = listMembers(db);

  return (
    <div className="flex min-h-dvh">
      <SidebarNav familyId={familyId} memberId={memberId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          familyId={familyId}
          memberId={memberId}
          familyName={family?.name ?? "Family"}
          memberName={member.name}
          families={families}
          members={members}
        />
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
      </div>
      <BottomNav familyId={familyId} memberId={memberId} />
    </div>
  );
}
