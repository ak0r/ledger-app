import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/db/client";
import { requirePrimaryUser } from "@/server/authz";
import { getProfile } from "@/server/use-cases/profiles";
import { ProfileForm } from "@/components/profile-form";
import { CleanUpContentButton } from "@/components/clean-up-content-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Rename only (docs/v9-delta/family-concept-contract.md §8.3's UX intent,
// adapted: editing a Profile's name must not change its identity/data). No
// Delete Profile action here — unlike the old Family edit page, there's no
// deleteProfile use-case in the server layer yet (2026-08-20 User
// Simplification delta didn't carry that capability forward), so this
// intentionally stops at rename + Clean Up Content. Reachable only from the
// /profiles roster (Primary User only) — a Normal AppUser has no in-app
// settings surface for their own Profile yet (no nav entry exists for one,
// per nav-items.ts's "no orphan nav destinations" principle).
export default async function EditProfilePage(props: PageProps<"/profiles/[profileId]/edit">) {
  await requirePrimaryUser();
  const { profileId } = await props.params;
  const profile = getProfile(db, profileId);
  if (!profile) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <Link
        href="/profiles"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Profiles
      </Link>

      <Card>
        <CardHeader>
          <CardTitle as="h1">Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm submitLabel="Save" mode="edit" profile={{ id: profile.id, name: profile.name }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clean Up Content</CardTitle>
          <CardDescription>
            Permanently delete all Accounts, Transactions, and other financial data in this
            Profile. The Profile itself will remain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CleanUpContentButton profileId={profileId} />
        </CardContent>
      </Card>
    </main>
  );
}
