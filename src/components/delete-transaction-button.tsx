"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteTransactionAction } from "@/server/actions/transactions";

// Delete flow with confirmation, no backup/undo mitigation (resolved
// 2026-08-15, HANDOFF.md open decisions #4) — matches ADR-019/rule #9 as
// already accepted: hard delete, no soft-delete field. ConfirmDialog is the
// entire safety net; the delete itself is immediate and permanent.
export function DeleteTransactionButton({ transactionId }: { transactionId: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          Delete
        </Button>
      }
      title="Delete this transaction?"
      description="This cannot be undone."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const result = await deleteTransactionAction({ transactionId });
        if (result.success) router.refresh();
        return result;
      }}
    />
  );
}
