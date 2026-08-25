import Link from "next/link";
import { db } from "@/server/db/client";
import { requirePrimaryUser } from "@/server/authz";
import { listProfiles } from "@/server/use-cases/profiles";
import { activateProfileAction } from "@/server/actions/activeProfile";
import { readActiveProfileIdCookie } from "@/server/activeProfile";
import { ProfileForm } from "@/components/profile-form";
import { ProfilesModal } from "@/components/profiles-modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Primary-User-only roster (2026-08-20 User Simplification delta), replaces
// the old /families picker (docs/v9-delta/family-concept-contract.md's UX
// intent, adapted to the flat Profile model: no dataset-per-Family
// isolation anymore, just a list of Profiles in the one shared database).
// A Normal AppUser never sees this — they land straight on their own
// /p/[profileId] (requirePrimaryUser handles that redirect).
export default async function ProfilesPage() {
  await requirePrimaryUser();

  const profiles = listProfiles(db);
  const activeProfileId = await readActiveProfileIdCookie();

  return (
    <ProfilesModal>
      <div>
        <h1 className="text-xl font-semibold">Profiles</h1>
        <p className="text-sm text-muted-foreground">
          Each Profile is a separate financial identity within this instance.
        </p>
      </div>

      {profiles.length > 0 && (
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <li key={profile.id} className="flex items-center gap-2">
              <form action={activateProfileAction.bind(null, profile.id)} className="flex-1">
                <Button
                  type="submit"
                  variant="outline"
                  className={
                    profile.id === activeProfileId
                      ? "w-full justify-start bg-accent text-accent-foreground"
                      : "w-full justify-start"
                  }
                >
                  {profile.name}
                  {profile.id === activeProfileId && (
                    <Badge variant="secondary" className="ml-auto">
                      Active
                    </Badge>
                  )}
                  {!profile.appUserId && (
                    <Badge variant="outline" className="ml-auto">
                      Unclaimed
                    </Badge>
                  )}
                </Button>
              </form>
              {!profile.appUserId && (
                <Link
                  href={`/register?profileId=${profile.id}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Registration link
                </Link>
              )}
              <Link
                href={`/profiles/${profile.id}/edit`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add another Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm submitLabel="Add Profile" />
        </CardContent>
      </Card>
    </ProfilesModal>
  );
}
