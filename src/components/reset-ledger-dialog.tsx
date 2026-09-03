"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetLedgerAction } from "@/server/actions/reset";

// Reset Ledger (2026-09-03 Settings/Backup/Data Management delta §17) —
// instance-level and irreversible, so this is its own dialog rather than
// the shared ConfirmDialog (confirm-dialog.tsx): that one takes a single
// description string with no room for the itemised scope list or a typed
// "RESET" gate the delta explicitly requires. `resetLedgerAction` redirects
// on success (to /register, since every AppUser is gone) — only a failure
// (wrong confirmation text, or a genuine server error) ever resolves back
// to this component.
export function ResetLedgerDialog() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onConfirm = async () => {
    setError(null);
    setPending(true);
    const result = await resetLedgerAction({ confirmation });
    setPending(false);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmation("");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="destructive" />}>Reset Ledger</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Ledger</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <p>This will permanently delete all Ledger data from this instance. This includes:</p>
          <ul className="list-inside list-disc text-muted-foreground">
            <li>Users</li>
            <li>Profiles</li>
            <li>Accounts</li>
            <li>Transactions</li>
            <li>Budgets</li>
            <li>Dashboards</li>
            <li>Backup History</li>
          </ul>
          <p className="font-medium text-destructive">This action cannot be undone.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-confirmation">
              Type <span className="font-mono font-semibold">RESET</span> to continue
            </Label>
            <Input
              id="reset-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending || confirmation !== "RESET"}
          >
            {pending ? "Resetting…" : "Reset Ledger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
