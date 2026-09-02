"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteBudgetAction } from "@/server/actions/budgets";

// Same posture as DeleteRecurringRuleButton — Budgets are hard-deleted
// (rule #9), no soft-delete field, so this is the entire safety net.
export function DeleteBudgetButton({ budgetId }: { budgetId: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          Delete
        </Button>
      }
      title="Delete this budget?"
      description="This cannot be undone. Ledger transactions are unaffected — only the Budget's own targets and history are removed."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const result = await deleteBudgetAction({ budgetId });
        if (result.success) router.refresh();
        return result;
      }}
    />
  );
}
