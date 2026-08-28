import { db } from "@/server/db/client";
import { requireActiveProfile } from "@/server/authz";
import { listProfiles } from "@/server/use-cases/profiles";
import { SidebarNav } from "@/components/sidebar-nav";
import { BottomNav } from "@/components/bottom-nav";
import { AppHeader } from "@/components/app-header";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Every route under here re-validates the active Profile on every request
// (rule #6) via requireActiveProfile() — Profile is application-level
// context (a cookie), not a URL segment, so there's no params to trust.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { appUser, profile } = await requireActiveProfile();

  // Only the Primary User gets a switcher — a Normal AppUser has exactly
  // one Profile (registration invariant) and nothing to switch between.
  const profiles = appUser.isPrimary ? listProfiles(db) : undefined;

  return (
    <div className="flex min-h-dvh">
      <SidebarNav isPrimary={appUser.isPrimary} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader activeProfileId={profile.id} profileName={profile.name} profiles={profiles} />
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
      </div>
      <BottomNav isPrimary={appUser.isPrimary} />
    </div>
  );
}
