import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { getCurrentAppUser } from "@/server/session";
import { getProfile, getProfileByAppUserId } from "@/server/use-cases/profiles";
import { readActiveProfileIdCookie } from "@/server/activeProfile";

// SQLite is a live local resource, never build-time data — this route must
// never be statically prerendered (docs/06-architecture.md: "SQLite is
// source of truth").
export const dynamic = "force-dynamic";

// "/" is excluded from proxy.ts's matcher, so it needs its own explicit
// session check. Two-tier resolution (AppUser -> Profile) — the Family
// tier is gone entirely (2026-08-20 User Simplification delta). A Normal
// AppUser always has exactly one Profile (registration invariant) and
// lands there directly, no cookie needed. The Primary User may have
// several Profiles; the activeProfileId cookie (convenience-only, same as
// every other cookie in this app) picks up where they left off.
export default async function Home() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const ownProfile = getProfileByAppUserId(db, appUser.id);
  if (!ownProfile) redirect("/login");

  if (!appUser.isPrimary) redirect(`/p/${ownProfile.id}`);

  const activeProfileId = await readActiveProfileIdCookie();
  const target = activeProfileId && getProfile(db, activeProfileId) ? activeProfileId : ownProfile.id;
  redirect(`/p/${target}`);
}
