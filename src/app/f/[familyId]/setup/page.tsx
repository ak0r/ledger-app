import Link from "next/link";
import { redirect } from "next/navigation";
import { getFamilyDb } from "@/server/db/family-client";
import { listMembers } from "@/server/use-cases/members";
import { createDemoFamilyAndActivateAction } from "@/server/actions/demo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Only reachable right after Family creation (docs/onboarding.md §3: "Demo
// data is available only while creating a new Family... Existing Families
// never receive demo-data choice"). Once any Member exists — whether from
// finishing setup or a resumed/interrupted attempt already past this step —
// this screen has nothing left to offer, so it bounces to the Member
// picker/setup continuation instead of re-asking.
export default async function FamilySetupPage(props: PageProps<"/f/[familyId]/setup">) {
  const { familyId } = await props.params;
  const db = getFamilyDb(familyId);
  if (listMembers(db).length > 0) redirect(`/f/${familyId}/members`);

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
          <form action={createDemoFamilyAndActivateAction.bind(null, familyId)}>
            <Button type="submit" className="w-full">
              Start with Demo Data
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Start from Scratch</CardTitle>
          <CardDescription>Set up your own Members, Accounts, and Transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/f/${familyId}/members`}
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            Start from Scratch
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
