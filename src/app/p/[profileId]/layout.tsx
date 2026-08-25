import { db } from "@/server/db/client";
import { requireProfileAccess } from "@/server/authz";
import { listProfiles } from "@/server/use-cases/profiles";
import { SidebarNav } from "@/components/sidebar-nav";
import { BottomNav } from "@/components/bottom-nav";
import { AppHeader } from "@/components/app-header";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Every route under here re-validates the Profile exists and is reachable
// by the current AppUser on every request (rule #6), via requireProfileAccess
// — no separate Family-ownership check needed anymore (2026-08-20 User
// Simplification delta collapsed that two-tier dance into one gate).
export default async function ProfileLayout({
  params,
  children,
}: {
  params: Promise<{ profileId: string }>;
  children: React.ReactNode;
}) {
  const { profileId } = await params;
  const { appUser, profile } = await requireProfileAccess(profileId);

  // Only the Primary User gets a switcher — a Normal AppUser has exactly
  // one Profile (registration invariant) and nothing to switch between.
  const profiles = appUser.isPrimary ? listProfiles(db) : undefined;

  return (
    <div className="flex min-h-dvh">
      <SidebarNav profileId={profileId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader profileId={profileId} profileName={profile.name} profiles={profiles} />
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
      </div>
      <BottomNav profileId={profileId} />
    </div>
  );
}
