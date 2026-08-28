"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cleanUpProfileContentAction } from "@/server/actions/cleanup";

// Clean Up Content — the primary use case is leaving a demo Profile's
// sample data behind without losing the Profile itself. Destructive (hard
// delete, rule #9) and Profile-wide — always confirmed, unlike Archive.
export function CleanUpContentButton({ profileId }: { profileId: string }) {
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
        description="This will permanently delete all accounts, transactions, postings, and other financial data in this Profile. Your Profile will remain."
        confirmLabel="Clean Up Content"
        destructive
        onConfirm={async () => {
          const result = await cleanUpProfileContentAction(profileId);
          if (result.success) {
            setDone(true);
            router.refresh();
          }
          return result;
        }}
      />
      {done && (
        <p className="text-sm text-muted-foreground">
          Content cleaned up. Your Profile is still here.
        </p>
      )}
    </div>
  );
}
