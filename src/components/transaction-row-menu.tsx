"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, MergeIcon, MoreHorizontal, Pencil, Repeat, Split, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ViewTransactionDrawer } from "@/components/view-transaction-drawer";
import { MergeTransactionsDialog } from "@/components/merge-transactions-dialog";
import { RecurringFormSheet } from "@/components/recurring-form-sheet";
import { useTransactionWorkspace } from "@/components/transaction-workspace";
import type { MergeCandidateAccount } from "@/lib/merge-eligibility";
import type { TransactionTableRow } from "@/components/transaction-table";
import { deleteTransactionAction } from "@/server/actions/transactions";
import { toMinorUnits } from "@/domain";
import { cn } from "@/lib/utils";

// Actions cell for both the desktop table and mobile card (product-polish
// delta plan #5): an icon-only Edit/Quick-Edit button plus a More menu (View
// Transaction / Edit / Split Transaction / Merge Transaction / Delete). Edit
// and Split both open the shared TransactionEditDrawer (Full Edit as a Sheet
// overlay, not a route — transactionworkspacedelta.md §5) via the workspace
// context; Split is a shortcut into Edit with a blank destination line
// pre-added (`initialSplit`, decision #3) — offered only when the
// transaction isn't already split (more than one destination), since an
// already-split transaction's Edit view already shows the full split UI.
// Merge Transaction (§11) is contextual — shown only when `mergeCandidates`
// (the page's own eligible-candidate scan, computed once in
// transaction-table.tsx) is non-empty for this row.
//
// Rows with more than one From account (`row.fromLines.length > 1` — only
// reachable by merging two transactions that shared a common From account,
// §11) can't go through Edit/Quick Edit/Split/Merge again: TransactionForm
// hardcodes a single `fromAccountId` field (rule #15's UI boundary), so
// opening it for one of these would silently drop every From posting past
// the first on save — the exact display bug this same phase's `fromLines`
// fix exists to close, just on write instead of read. View and Delete are
// unaffected (neither assumes a single From). This is strictly narrower
// than `isSplit` (multiple *To* postings), which Full Edit already handles
// fine — only Quick Edit is blocked for that case.
export function TransactionRowMenu({
  row,
  onQuickEdit,
  mergeCandidates = [],
  accounts = [],
  accountsById,
  currencySymbol,
  currencyScale,
  quickEditForceVisible = false,
}: {
  row: TransactionTableRow;
  // Desktop table only (transactionworkspacedelta.md §6/§16 — no Quick Edit
  // icon on mobile): when provided, the standalone Pencil button sets
  // quickEditRowId in the workspace instead of opening Full Edit. Omitted
  // on mobile, where Pencil still opens Full Edit directly.
  onQuickEdit?: (rowId: string) => void;
  mergeCandidates?: TransactionTableRow[];
  // "Make recurring" (spec §3) needs name/classification for RecurringForm's
  // account picker — accountsById (below) only carries currencyId, enough
  // for Merge but not this.
  accounts?: { id: string; name: string; classification: string }[];
  accountsById?: ReadonlyMap<string, MergeCandidateAccount>;
  currencySymbol?: string;
  currencyScale?: number;
  // Desktop only (deltatransactiongridpostingrowsbulkactions20260818.md
  // §3): the Quick Edit icon is hidden on idle rows, revealed on hover via
  // `group-hover/row` (works for the common single-physical-row case with
  // zero extra state) or keyboard focus via `group-focus-within/row`. Split
  // transactions render this button on their *first* physical row only,
  // but hovering a *later* posting row (a sibling `<tr>`, not a descendant)
  // can't reach it via pure CSS — the caller (`TransactionRow`) tracks that
  // cross-row hover in local state and passes it through here.
  quickEditForceVisible?: boolean;
}) {
  const router = useRouter();
  const { openEditTransaction } = useTransactionWorkspace();
  const [viewOpen, setViewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [makeRecurringOpen, setMakeRecurringOpen] = useState(false);
  const isSplit = row.toLines.length > 1;
  const isMultiFrom = row.fromLines.length > 1;
  const quickEditDisabledReason = isMultiFrom
    ? "Transactions merged from multiple source accounts can't be edited here yet"
    : isSplit
      ? "Split transactions use Full Edit"
      : undefined;

  return (
    <div className="flex justify-end gap-1">
      {onQuickEdit ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Quick edit transaction"
                disabled={isSplit || isMultiFrom}
                // A truly-disabled native <button> never fires the hover/
                // focus events Tooltip listens for (browsers block pointer
                // events on `disabled` elements), so `title` stays as the
                // fallback specifically for that state — the two never
                // fight, since only one can actually show at a time.
                title={quickEditDisabledReason}
                onClick={() => onQuickEdit(row.id)}
                className={cn(
                  "opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100",
                  quickEditForceVisible && "opacity-100",
                )}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent>Quick edit</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Edit transaction"
                disabled={isMultiFrom}
                title={isMultiFrom ? quickEditDisabledReason : undefined}
                onClick={() => openEditTransaction(row.id)}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent>Edit transaction</TooltipContent>
        </Tooltip>
      )}

      <Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="More actions">
                    <MoreHorizontal className="size-3.5" aria-hidden="true" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent>More actions</TooltipContent>
        </Tooltip>
        <MenuContent>
          <MenuItem onClick={() => setViewOpen(true)}>
            <Eye className="size-3.5" aria-hidden="true" />
            <span className="ml-2">View Transaction</span>
          </MenuItem>
          {!isMultiFrom && (
            <MenuItem onClick={() => openEditTransaction(row.id)}>
              <Pencil className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Edit</span>
            </MenuItem>
          )}
          {!isSplit && !isMultiFrom && (
            <MenuItem onClick={() => openEditTransaction(row.id, { initialSplit: true })}>
              <Split className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Split Transaction</span>
            </MenuItem>
          )}
          {/* Phase 1 (spec §11/§13): only a normal non-split transaction is
              the safe supported case — same guard as Split Transaction
              above. */}
          {!isSplit &&
            !isMultiFrom &&
            accounts.length > 0 &&
            currencySymbol !== undefined &&
            currencyScale !== undefined && (
              <MenuItem onClick={() => setMakeRecurringOpen(true)}>
                <Repeat className="size-3.5" aria-hidden="true" />
                <span className="ml-2">Make recurring</span>
              </MenuItem>
            )}
          {mergeCandidates.length > 0 && (
            <MenuItem onClick={() => setMergeOpen(true)}>
              <MergeIcon className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Merge Transaction</span>
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem
            className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            <span className="ml-2">Delete</span>
          </MenuItem>
        </MenuContent>
      </Menu>

      <ViewTransactionDrawer row={row} open={viewOpen} onOpenChange={setViewOpen} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this transaction?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const result = await deleteTransactionAction({ transactionId: row.id });
          if (result.success) router.refresh();
          return result;
        }}
      />
      {accounts.length > 0 && currencySymbol !== undefined && currencyScale !== undefined && row.edit.toLines[0] && (
        <RecurringFormSheet
          mode="create"
          open={makeRecurringOpen}
          onOpenChange={setMakeRecurringOpen}
          accounts={accounts}
          currencySymbol={currencySymbol}
          currencyScale={currencyScale}
          prefill={{
            name: row.description,
            fromAccountId: row.edit.fromAccountId,
            toAccountId: row.edit.toLines[0].accountId,
            amountMinor: toMinorUnits(row.edit.amount, currencyScale),
            description: row.description,
            startDate: row.date,
          }}
        />
      )}
      {accountsById && currencySymbol !== undefined && currencyScale !== undefined && (
        <MergeTransactionsDialog
          // Same staleness guard as BulkActionBar's own usage — see that
          // one's comment for why (this dialog's internal pre-checked state
          // only initializes once per mount, not per open).
          key={[row.id, ...mergeCandidates.map((candidate) => candidate.id)].join(",")}
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          rows={[row, ...mergeCandidates]}
          accountsById={accountsById}
          currencySymbol={currencySymbol}
          currencyScale={currencyScale}
        />
      )}
    </div>
  );
}
