"use client";

import { useState } from "react";
import type { RecurringFrequency } from "@/core";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RecurringForm } from "@/components/recurring-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

// Create and Edit as one Sheet overlay (mirrors AccountFormSheet's own
// dual-mode). Two ways to open it, same as ConfirmDialog: pass `trigger`
// for an uncontrolled standalone element (Rules table's own Edit button),
// or pass controlled `open`/`onOpenChange` instead when the real trigger
// already lives inside a Menu (TransactionRowMenu's "Make recurring" —
// nesting a SheetTrigger's `render` merge inside a MenuItem never actually
// opens the sheet, same reasoning as ConfirmDialog's own doc comment).
// Create still also has its own route (/recurring/new, Phase D) as the
// Rules tab's "+ Add New" entry point — this is the second, prefillable
// entry point (spec §3's "Make recurring" from an existing transaction),
// not a replacement of it.
export function RecurringFormSheet({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  accounts,
  currencySymbol,
  currencyScale,
  mode,
  recurringRule,
  prefill,
}: {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  accounts: { id: string; name: string; classification: string }[];
  currencySymbol: string;
  currencyScale: number;
  mode: "create" | "edit";
  recurringRule?: {
    id: string;
    name: string;
    fromAccountId: string;
    toAccountId: string;
    amountMinor: number;
    description: string;
    frequency: RecurringFrequency;
    byMonthDay: number | null;
    byWeekday: number | null;
    startDate: string;
    endDate: string | null;
  };
  prefill?: {
    name?: string;
    fromAccountId?: string;
    toAccountId?: string;
    amountMinor?: number;
    description?: string;
    startDate?: string;
  };
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
            <SheetTitle>{mode === "create" ? "Create Recurring Rule" : "Edit Recurring Rule"}</SheetTitle>
          </SheetHeader>
          {open && (
            <RecurringForm
              accounts={accounts}
              currencySymbol={currencySymbol}
              currencyScale={currencyScale}
              mode={mode}
              recurringRule={recurringRule}
              prefill={prefill}
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
