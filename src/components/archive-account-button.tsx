"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { archiveAccountAction } from "@/server/actions/accounts";

// Archiving is state-changing (hides the Account from active views) but was
// previously a one-click zero-JS form with no confirmation at all, unlike
// Transaction delete — inconsistent (docs/design/design.md §19). Same
// ConfirmDialog, not destructive-styled since archive isn't data loss.
export function ArchiveAccountButton({
  profileId,
  accountId,
  variant = "ghost",
}: {
  profileId: string;
  accountId: string;
  variant?: "ghost" | "outline";
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant={variant} size={variant === "ghost" ? "sm" : "default"}>
          Archive
        </Button>
      }
      title="Archive this account?"
      description="It will be marked archived. Its existing transactions and balance are unaffected."
      confirmLabel="Archive"
      onConfirm={async () => {
        await archiveAccountAction(profileId, accountId);
        router.refresh();
      }}
    />
  );
}
