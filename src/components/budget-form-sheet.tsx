"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BudgetForm, type BudgetFormExistingBudget, type BudgetFormExpenseAccount } from "@/components/budget-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

// Edit entry point from the Budgets landing page's card menu — mirrors
// RecurringFormSheet exactly (same discard-guard, same trigger/controlled
// dual-mode). Create's primary entry point stays a full page (/budgets/new,
// spec §15.2's form has enough surface — recurrence + scope + filter +
// allocations — that a full page reads better there than a Sheet).
export function BudgetFormSheet({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  expenseAccounts,
  currencySymbol,
  currencyScale,
  budget,
}: {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  expenseAccounts: BudgetFormExpenseAccount[];
  currencySymbol: string;
  currencyScale: number;
  budget: BudgetFormExistingBudget;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
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
        {trigger && <SheetTrigger render={trigger} />}
        <SheetContent className="md:max-w-md gap-4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Budget</SheetTitle>
          </SheetHeader>
          {open && (
            <BudgetForm
              mode="edit"
              expenseAccounts={expenseAccounts}
              currencySymbol={currencySymbol}
              currencyScale={currencyScale}
              budget={budget}
              onSuccess={() => setOpen(false)}
              onCancel={() => guard.requestClose()}
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
