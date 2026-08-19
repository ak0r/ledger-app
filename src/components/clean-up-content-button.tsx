"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cleanUpFamilyContentAction } from "@/server/actions/cleanup";

// Clean Up Content (docs/onboarding.md §11) — the primary use case is
// leaving a demo Family's sample data behind without losing the Family/
// Members themselves. Destructive (hard delete, rule #9) and Family-wide
// (every Member's data, not just one) — always confirmed, unlike Archive.
export function CleanUpContentButton({ familyId }: { familyId: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <ConfirmDialog
        trigger={
          <Button type="button" variant="destructive">
            Clean Up Content
          </Button>
        }
        title="Clean up content?"
        description="This will permanently delete all accounts, transactions, postings, and other financial data in this Family. Your Family and Members will remain."
        confirmLabel="Clean Up Content"
        destructive
        onConfirm={async () => {
          const result = await cleanUpFamilyContentAction(familyId);
          if (result.success) {
            setDone(true);
            router.refresh();
          }
          return result;
        }}
      />
      {done && (
        <p className="text-sm text-muted-foreground">
          Content cleaned up. Your Family and Members are still here.
        </p>
      )}
    </div>
  );
}
