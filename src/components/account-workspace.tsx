"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Selection state for the Accounts table's Bulk Actions — deliberately
// much smaller than TransactionWorkspaceContext: Account rows are always
// exactly one physical `<tr>` each (no split/merge multi-row rendering),
// so there's no cross-physical-row hover state or roving-tabindex keyboard
// grid to coordinate — pure CSS `group-hover` on each row handles the
// checkbox/edit-pencil reveal with zero JS state. Just selection.
interface AccountWorkspaceContextValue {
  selectedIds: ReadonlySet<string>;
  toggleSelected: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
}

const AccountWorkspaceContext = createContext<AccountWorkspaceContextValue | null>(null);

// Same `key={rowIds.join(",")}`-remount-to-reset pattern as
// TransactionWorkspaceProvider — pass a fresh key from the page whenever
// the filtered account set changes so stale selection can't survive a
// filter/search change.
export function AccountWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

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

  const value = useMemo<AccountWorkspaceContextValue>(
    () => ({ selectedIds, toggleSelected, selectAll, clearSelection }),
    [selectedIds, toggleSelected, selectAll, clearSelection],
  );

  return <AccountWorkspaceContext.Provider value={value}>{children}</AccountWorkspaceContext.Provider>;
}

export function useAccountWorkspace(): AccountWorkspaceContextValue {
  const context = useContext(AccountWorkspaceContext);
  if (!context) {
    throw new Error("useAccountWorkspace must be used within an AccountWorkspaceProvider");
  }
  return context;
}
