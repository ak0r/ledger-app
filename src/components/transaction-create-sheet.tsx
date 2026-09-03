"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TransactionForm, type TransactionFormAccount } from "@/components/transaction-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

// New Transaction as a Sheet, self-contained (own `open` state, same
// pattern as AccountFormSheet — "there's nothing to gain from centralizing
// this Sheet" when the caller has no shared workspace context to plug
// into). Used from the Account Detail header's "+ Add Transaction", which
// previously navigated to the full-page /transactions/new route instead of
// matching the Sheet-overlay pattern every other "New Transaction" entry
// point uses (TransactionCreateDrawer, driven by TransactionWorkspaceProvider
// — not reused here since that provider also owns selection/quick-edit/
// roving-focus state that has no meaning on this page, and is only ever
// instantiated inside the Transactions tab's own conditional render, not
// the shared three-tab layout this button lives in).
export function TransactionCreateSheet({
  trigger,
  accounts,
  existingTags,
  defaultFromAccountId,
}: {
  trigger: React.ReactElement;
  accounts: TransactionFormAccount[];
  existingTags: string[];
  defaultFromAccountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const guard = useUnsavedChangesGuard(() => setOpen(false));

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) {
            setOpen(true);
          } else {
            guard.requestClose();
          }
        }}
      >
        <SheetTrigger render={trigger} />
        <SheetContent className="md:max-w-md gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Transaction</SheetTitle>
          </SheetHeader>
          {open && (
            <TransactionForm
              mode="create"
              accounts={accounts}
              existingTags={existingTags}
              defaultFromAccountId={defaultFromAccountId}
              onCancel={() => guard.requestClose()}
              onSuccess={() => setOpen(false)}
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
