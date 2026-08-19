"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Shared destructive/state-changing confirmation (docs/design/design.md
// §19's ConfirmDialog) — replaces native window.confirm() everywhere it was
// used, on top of the existing ui/dialog.tsx primitive rather than a new one.
//
// Two ways to open it: pass `trigger` for a standalone element (a plain
// <Button>, uncontrolled — the common case), or pass controlled `open`/
// `onOpenChange` instead when the real trigger already lives inside another
// Base UI composite (e.g. a Menu's MenuItem, as in TransactionRowMenu's
// Delete entry). Nesting a DialogTrigger's `render` merge *inside* a
// MenuItem never actually opens the dialog — Menu's own item-selection
// handling closes the menu before/instead of the merged click reaching
// Dialog's open logic. Controlled mode sidesteps that: the MenuItem's own
// onClick flips external state, same pattern as ViewTransactionDrawer next
// to it, and no DialogTrigger is rendered at all.
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<{ success: boolean; error?: string } | void>;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (result && !result.success) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
