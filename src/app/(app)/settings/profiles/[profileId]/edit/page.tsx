import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/persistence/client";
import { requirePrimaryUser } from "@/server/authz";
import { getProfile } from "@/server/services/profiles";
import { listCurrencies } from "@/server/services/currencies";
import { decryptPan, maskPan } from "@/server/security/pan";
import { ProfileForm } from "@/components/profile-form";
import { PrimaryCurrencyForm } from "@/components/primary-currency-form";
import { PanForm } from "@/components/pan-form";
import { CleanUpContentButton } from "@/components/clean-up-content-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Rename only — editing a Profile's name must not change its identity/data.
// No Delete Profile action here — there's no deleteProfile use-case in the
// server layer yet (2026-08-20 User Simplification delta didn't carry that
// capability forward), so this intentionally stops at rename + Clean Up
// Content. Reachable only from the /settings/profiles roster (Primary User
// only) — the Settings nav entry itself is Primary-only for the same
// reason (nav-items.ts's "no orphan nav destinations" principle: a Normal
// AppUser has no in-app settings surface for their own Profile yet).
export default async function EditProfilePage(props: PageProps<"/settings/profiles/[profileId]/edit">) {
  await requirePrimaryUser();
  const { profileId } = await props.params;
  const profile = getProfile(db, profileId);
  if (!profile) notFound();
  const currencies = listCurrencies(db, profileId);
  const maskedPan = profile.panEncrypted ? maskPan(decryptPan(profile.panEncrypted)) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/settings/profiles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Manage Profiles
        </Link>
        <h1 className="text-xl font-semibold">Edit Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm submitLabel="Save" mode="edit" profile={{ id: profile.id, name: profile.name }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Primary Currency</CardTitle>
          <CardDescription>
            Default currency for new Accounts in this Profile. Does not change existing Accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PrimaryCurrencyForm
            profileId={profile.id}
            currencies={currencies.map((c) => ({ id: c.id, code: c.code, symbol: c.symbol }))}
            primaryCurrencyId={profile.primaryCurrencyId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PAN</CardTitle>
          <CardDescription>
            Checked against every CAS statement imported for this Profile — an import from a
            different PAN is rejected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PanForm profileId={profile.id} maskedPan={maskedPan} />
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
    </div>
  );
}
