"use client";

import { useState } from "react";

// Shared "Discard changes?" gate for Sheet-based create/edit overlays
// (edit-visual-behaviour delta §12) — one implementation, not bespoke per
// entity (§13). `TransactionForm`/`AccountForm` report their own dirty
// state (RHF's `formState.isDirty` plus non-RHF state like tags/icon) via
// `onDirtyChange`; the wrapping Sheet calls `requestClose` from its own
// `onOpenChange` (fires on Escape, backdrop click, and the X button alike
// — Base UI routes all three through the same handler) instead of closing
// directly, and renders a `ConfirmDialog` driven by `confirmOpen`/
// `confirmDiscard`. A clean (non-dirty) close — or a successful Save,
// which never goes through `requestClose` at all — never shows the prompt.
export function useUnsavedChangesGuard(close: () => void) {
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestClose = () => {
    if (isDirty) {
      setConfirmOpen(true);
      return;
    }
    close();
  };

  const confirmDiscard = () => {
    setConfirmOpen(false);
    close();
  };

  return { isDirty, setIsDirty, confirmOpen, setConfirmOpen, requestClose, confirmDiscard };
}
