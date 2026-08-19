"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Selection/edit state for the Transaction Workspace (transactionworkspacedelta.md
// §22/23) lives here, not inside individual row components (§12) — rows read
// and dispatch through this context instead of owning local state, so
// selection survives independent of which row happens to re-render.
interface TransactionWorkspaceContextValue {
  selectedIds: ReadonlySet<string>;
  toggleSelected: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  quickEditRowId: string | null;
  setQuickEditRowId: (id: string | null) => void;
  editingTransactionId: string | null;
  // Whether Full Edit (TransactionEditDrawer) should pre-add a blank
  // destination line on open — set by the row menu's "Split Transaction"
  // entry point, read once by TransactionForm's `initialSplit` prop.
  editingInitialSplit: boolean;
  openEditTransaction: (transactionId: string, options?: { initialSplit?: boolean }) => void;
  closeEditTransaction: () => void;
  openDialog: "view" | "merge" | null;
  setOpenDialog: (dialog: "view" | "merge" | null) => void;
  // Roving-tabindex focus target for desktop keyboard navigation
  // (deltatransactiongridconnectorkeyboard20260818.md §2) — which row is the
  // grid's single Tab stop. Resets for free via the provider's existing
  // key={rowIds.join(",")} remount pattern, same as everything else here.
  focusedRowId: string | null;
  setFocusedRowId: (id: string | null) => void;
}

const TransactionWorkspaceContext = createContext<TransactionWorkspaceContextValue | null>(null);

// `rowIds` is the current page's already-filtered row set — the provider
// must reset all workspace state whenever that set changes (page nav,
// filter change, Clear filters), per §13: "changing page/filter/account
// scope must clear incompatible selection". Member/Family switches already
// remount this whole tree via route params, so those are automatic.
//
// The reset itself is the caller's job, not this component's: pass
// `key={rowIds.join(",")}` when rendering this provider (same remount-to-
// reset pattern already used for TransactionFilterDrawer/
// TransactionQuickSearch) so a new row-id signature simply remounts a fresh
// provider instance with fresh state — no `useEffect`-driven `setState`
// cascade needed.
export function TransactionWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [quickEditRowId, setQuickEditRowId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingInitialSplit, setEditingInitialSplit] = useState(false);
  const [openDialog, setOpenDialog] = useState<"view" | "merge" | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

  const openEditTransaction = useCallback(
    (transactionId: string, options?: { initialSplit?: boolean }) => {
      setEditingTransactionId(transactionId);
      setEditingInitialSplit(options?.initialSplit ?? false);
    },
    [],
  );
  const closeEditTransaction = useCallback(() => {
    setEditingTransactionId(null);
    setEditingInitialSplit(false);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => setSelectedIds(new Set(ids)), []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const value = useMemo<TransactionWorkspaceContextValue>(
    () => ({
      selectedIds,
      toggleSelected,
      selectAll,
      clearSelection,
      quickEditRowId,
      setQuickEditRowId,
      editingTransactionId,
      editingInitialSplit,
      openEditTransaction,
      closeEditTransaction,
      openDialog,
      setOpenDialog,
      focusedRowId,
      setFocusedRowId,
    }),
    [
      selectedIds,
      toggleSelected,
      selectAll,
      clearSelection,
      quickEditRowId,
      editingTransactionId,
      editingInitialSplit,
      openEditTransaction,
      closeEditTransaction,
      openDialog,
      focusedRowId,
    ],
  );

  return (
    <TransactionWorkspaceContext.Provider value={value}>{children}</TransactionWorkspaceContext.Provider>
  );
}

export function useTransactionWorkspace(): TransactionWorkspaceContextValue {
  const context = useContext(TransactionWorkspaceContext);
  if (!context) {
    throw new Error("useTransactionWorkspace must be used within a TransactionWorkspaceProvider");
  }
  return context;
}
