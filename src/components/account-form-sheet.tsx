"use client";

import { useState } from "react";
import type { Classification, InstrumentType } from "@/domain";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AccountForm } from "@/components/account-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

// New Account and Edit Account as one Sheet overlay, not two full-page
// routes — same "Full Edit as a Sheet, not a route" pattern as
// transaction-edit-drawer.tsx. Self-contained (owns its own `open` state,
// one instance per trigger — a "+ New Account" button, or each row's own
// "Edit" button) rather than reading from a shared workspace context: the
// Accounts list doesn't have one yet (unlike Transactions' `TransactionRow`,
// which already needs shared selection/focus state for other reasons), so
// there's nothing to gain from centralizing this Sheet the way
// `TransactionEditDrawer` centralizes Transaction's. `accounts/new` and
// `accounts/[id]/settings` (the full-page routes `AccountForm` still
// supports via its default router.push behavior) are untouched — this is
// an additional, faster entry point from the list, not a replacement of
// every way to reach the form.
export function AccountFormSheet({
  trigger,
  currencies,
  mode,
  existingTags,
  account,
}: {
  trigger: React.ReactElement;
  currencies: { id: string; code: string; symbol: string; minorUnitScale: number }[];
  mode: "create" | "edit";
  existingTags?: string[];
  account?: {
    id: string;
    currencyId: string;
    currencyCode: string;
    name: string;
    classification: Classification;
    instrumentType: InstrumentType;
    tags: string[] | null;
    icon: string | null;
  };
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
            <SheetTitle>{mode === "create" ? "New Account" : "Edit Account"}</SheetTitle>
          </SheetHeader>
          {open && (
            <AccountForm
              currencies={currencies}
              mode={mode}
              existingTags={existingTags}
              account={account}
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
