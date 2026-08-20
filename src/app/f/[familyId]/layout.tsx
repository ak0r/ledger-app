import { requireFamilyOwner } from "@/server/authz";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Validates the Family exists AND belongs to the current AppUser before any
// route beneath here tries to open its isolated dataset. A missing/bogus/
// not-yours familyId must fail safely — redirect to the Family picker (or
// /login if not even signed in), never silently open or create a dataset
// (docs/v9-delta/family-concept-contract.md §10).
export default async function FamilyLayout({
  params,
  children,
}: {
  params: Promise<{ familyId: string }>;
  children: React.ReactNode;
}) {
  const { familyId } = await params;
  await requireFamilyOwner(familyId);

  return <>{children}</>;
}
