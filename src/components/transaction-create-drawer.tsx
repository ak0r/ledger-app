"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TransactionForm } from "@/components/transaction-form";
import { useTransactionWorkspace } from "@/components/transaction-workspace";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

// Transaction Create as a Sheet, not a route (edit-visual-behaviour delta
// §1) — mirrors TransactionEditDrawer almost exactly, minus a row to look
// up. `/transactions/new` itself stays reachable (untouched), this is just
// the primary entry point now.
export function TransactionCreateDrawer({
  familyId,
  memberId,
  accounts,
  currencySymbol,
  currencyScale,
  existingTags,
}: {
  familyId: string;
  memberId: string;
  accounts: { id: string; name: string; classification: string }[];
  currencySymbol: string;
  currencyScale: number;
  existingTags: string[];
}) {
  const { creatingTransaction, closeCreateTransaction } = useTransactionWorkspace();
  const guard = useUnsavedChangesGuard(closeCreateTransaction);

  return (
    <>
      <Sheet open={creatingTransaction} onOpenChange={(open) => !open && guard.requestClose()}>
        <SheetContent className="md:max-w-md gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Transaction</SheetTitle>
          </SheetHeader>
          {creatingTransaction && (
            <TransactionForm
              key={creatingTransaction ? "open" : "closed"}
              mode="create"
              familyId={familyId}
              memberId={memberId}
              accounts={accounts}
              currencySymbol={currencySymbol}
              currencyScale={currencyScale}
              existingTags={existingTags}
              onCancel={() => guard.requestClose()}
              onSuccess={closeCreateTransaction}
              onDirtyChange={guard.setIsDirty}
            />
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={guard.confirmOpen}
        onOpenChange={guard.setConfirmOpen}
        title="Discard changes?"
        description="Your changes have not been saved."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        destructive
        onConfirm={async () => guard.confirmDiscard()}
      />
    </>
  );
}
