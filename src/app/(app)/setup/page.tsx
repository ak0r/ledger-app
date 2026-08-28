import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { requireActiveProfile } from "@/server/authz";
import { listAccounts } from "@/server/use-cases/accounts";
import { createDemoProfileDataAndActivateAction } from "@/server/actions/demo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Only reachable right after Profile creation (docs/onboarding.md §3,
// adapted: "Demo data is available only while creating a new Profile...
// Existing Profiles never receive demo-data choice") — every AppUser's
// registration already creates/links exactly one Profile (2026-08-20 User
// Simplification delta), so there's no Member-picking step left at all;
// once any Account exists, this screen has nothing left to offer and
// bounces straight to Accounts.
export default async function ProfileSetupPage() {
  const { profile } = await requireActiveProfile();
  if (listAccounts(db, profile.id).length > 0) redirect("/accounts");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">How would you like to start?</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start with Demo Data</CardTitle>
          <CardDescription>Explore Ledger with realistic sample data.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createDemoProfileDataAndActivateAction}>
            <Button type="submit" className="w-full">
              Start with Demo Data
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Start from Scratch</CardTitle>
          <CardDescription>Set up your own Accounts and Transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/accounts"
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            Start from Scratch
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
