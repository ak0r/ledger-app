"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MemberForm } from "@/components/member-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

// Steady-state "Add another Member" as a modal, not an inline Card
// (edit-visual-behaviour delta §4) — ordinary contextual CRUD, same
// unsaved-changes guard as every other create/edit overlay for consistency
// (delta §13). Onboarding's own MemberForm usage (mode="add", embedded in
// the setup page) is untouched — that's part of the dedicated onboarding
// flow, not this.
export function MemberCreateDialog({ familyId, trigger }: { familyId: string; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const guard = useUnsavedChangesGuard(() => setOpen(false));

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) {
            setOpen(true);
          } else {
            guard.requestClose();
          }
        }}
      >
        <DialogTrigger render={trigger} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add another Member</DialogTitle>
          </DialogHeader>
          {open && (
            <MemberForm
              familyId={familyId}
              submitLabel="Add Member"
              onSuccess={() => setOpen(false)}
              onCancel={() => guard.requestClose()}
              onDirtyChange={guard.setIsDirty}
            />
          )}
        </DialogContent>
      </Dialog>
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
