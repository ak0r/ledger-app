"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteRecurringRuleAction } from "@/server/actions/recurring";

// Same posture as DeleteTransactionButton — no soft-delete field for
// Recurring Rules either, so this is the entire safety net.
export function DeleteRecurringRuleButton({ recurringRuleId }: { recurringRuleId: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          Delete
        </Button>
      }
      title="Delete this recurring rule?"
      description="This cannot be undone. Transactions already created from it are unaffected."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const result = await deleteRecurringRuleAction({ recurringRuleId });
        if (result.success) router.refresh();
        return result;
      }}
    />
  );
}
