import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActiveProfile } from "@/server/authz";
import { UpdatePasswordForm } from "@/components/update-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

// Manage Account (2026-09-03 Settings/Backup/Data Management delta §3) —
// the logged-in application account, not the active Profile. Delete
// Account is explicitly deferred (user direction), so this page currently
// has exactly one action.
export default async function ManageAccountPage() {
  await requireActiveProfile();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="text-xl font-semibold">Manage Account</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Update password</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
