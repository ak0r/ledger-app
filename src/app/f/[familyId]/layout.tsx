import { redirect } from "next/navigation";
import { registryDb } from "@/server/db/registry-client";
import { getFamily } from "@/server/use-cases/families";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Validates the Family exists in the registry before any route beneath here
// tries to open its isolated dataset. A missing/bogus familyId must fail
// safely — redirect to the Family picker, never silently open or create a
// dataset (docs/v9-delta/family-concept-contract.md §10).
export default async function FamilyLayout({
  params,
  children,
}: {
  params: Promise<{ familyId: string }>;
  children: React.ReactNode;
}) {
  const { familyId } = await params;
  const family = getFamily(registryDb, familyId);
  if (!family) redirect("/families");

  return <>{children}</>;
}
