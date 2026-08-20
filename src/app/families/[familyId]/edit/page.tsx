import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireFamilyOwner } from "@/server/authz";
import { FamilyForm } from "@/components/family-form";
import { CleanUpContentButton } from "@/components/clean-up-content-button";
import { DeleteFamilyButton } from "@/components/delete-family-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Rename (docs/v9-delta/family-concept-contract.md §8.3) — editing a
// Family's name must not change its dataset identity. Family deletion
// (product-polish pass) supersedes the earlier "leave the action out"
// interim choice — contract §15 only forbade a *fake* deletion
// (soft-delete/hide-from-selector); this is a real hard delete of the
// dataset file, which is exactly what §15 requires if deletion is
// implemented at all. Clean Up Content (docs/onboarding.md §11) stays a
// distinct, separately-confirmed action that wipes financial content but
// keeps the Family/Members — deletion here removes everything.
//
// This route is a sibling top-level route, not nested under
// /f/[familyId]/layout.tsx, so it needs its own ownership check —
// requireFamilyOwner redirects to /families for a missing-or-not-yours
// familyId (unified with every other ownership bounce in the app, in place
// of the previous notFound()).
export default async function EditFamilyPage(props: PageProps<"/families/[familyId]/edit">) {
  const { familyId } = await props.params;
  const { family } = await requireFamilyOwner(familyId);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <Link
        href="/families"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Families
      </Link>

      <Card>
        <CardHeader>
          <CardTitle as="h1">Edit Family</CardTitle>
        </CardHeader>
        <CardContent>
          <FamilyForm submitLabel="Save" mode="edit" family={{ id: family.id, name: family.name }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clean Up Content</CardTitle>
          <CardDescription>
            Permanently delete all Accounts, Transactions, and other financial data in this
            Family. Your Family and Members will remain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CleanUpContentButton familyId={familyId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete Family</CardTitle>
          <CardDescription>
            Permanently delete &ldquo;{family.name}&rdquo; and everything in it — Members,
            Accounts, Transactions, Postings, and other Family-owned data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteFamilyButton familyId={familyId} familyName={family.name} />
        </CardContent>
      </Card>
    </main>
  );
}
