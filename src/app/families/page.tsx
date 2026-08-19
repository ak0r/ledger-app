import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { registryDb } from "@/server/db/registry-client";
import { listFamilies } from "@/server/use-cases/families";
import { activateFamilyAction } from "@/server/actions/activeFamily";
import { readActiveFamilyIdCookie } from "@/server/activeFamily";
import { FamilyForm } from "@/components/family-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Application-level, above any Family's isolated dataset (docs/v9-delta/
// family-concept-contract.md §8.1) — always shows the full picker, never
// auto-redirects, mirroring /f/[familyId]/members's Member picker.
export default async function FamiliesPage() {
  const families = listFamilies(registryDb);
  const isFirstFamily = families.length === 0;
  const activeFamilyId = await readActiveFamilyIdCookie();
  // Only a real destination when the cookie actually resolves to a Family
  // that still exists — "/" itself re-derives the correct entry path
  // (resolveFamilyEntryPath), so this reuses that instead of guessing a URL.
  const canGoBack = families.some((family) => family.id === activeFamilyId);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      {canGoBack && (
        <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back
        </Link>
      )}

      <div>
        <h1 className="text-xl font-semibold">
          {isFirstFamily ? "Welcome to Ledger" : "Choose a Family"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isFirstFamily
            ? "Create your first Family to get started."
            : "Each Family is a separate, isolated financial dataset."}
        </p>
      </div>

      {families.length > 0 && (
        <ul className="flex flex-col gap-2">
          {families.map((family) => (
            <li key={family.id} className="flex items-center gap-2">
              <form action={activateFamilyAction.bind(null, family.id)} className="flex-1">
                <Button
                  type="submit"
                  variant="outline"
                  className={
                    family.id === activeFamilyId
                      ? "w-full justify-start bg-accent text-accent-foreground"
                      : "w-full justify-start"
                  }
                >
                  {family.name}
                  {family.id === activeFamilyId && (
                    <Badge variant="secondary" className="ml-auto">
                      Active
                    </Badge>
                  )}
                </Button>
              </form>
              <Link
                href={`/families/${family.id}/edit`}
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
          <CardTitle>
            {isFirstFamily ? "Create your first Family" : "Add another Family"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FamilyForm submitLabel={isFirstFamily ? "Get started" : "Add Family"} />
        </CardContent>
      </Card>
    </main>
  );
}
