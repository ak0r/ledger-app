"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Merge as MergeIcon, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MergeTransactionsDialog } from "@/components/merge-transactions-dialog";
import { BulkTagsDialog } from "@/components/bulk-tags-dialog";
import { useTransactionWorkspace } from "@/components/transaction-workspace";
import { checkMergeEligibility, type MergeCandidateAccount } from "@/lib/merge-eligibility";
import { toMergeCandidate } from "@/lib/transaction-rows";
import type { TransactionTableRow } from "@/components/transaction-table";
import { bulkDeleteTransactionsAction } from "@/server/actions/transactions";

// Renders above the table once any row is selected (transactionworkspacedelta.md
// §12). One "Bulk Actions" dropdown
// (deltatransactiongridpostingrowsbulkactions20260818.md §5 — "prefer one
// Bulk Actions button/dropdown, rather than displaying every action as a
// toolbar button") replaces the earlier separate Merge/Tags/Delete buttons
// plus a separate "More" menu (Phase G) — also what makes this bar
// mobile-appropriate now (§7): that three-button row was genuinely
// desktop-only-shaped, this compact dropdown isn't, so mobile gets the
// identical bar rather than a second implementation (extending Phase B's
// desktop-only selection scope, which its own comment already flagged as
// "for this pass" rather than a hard restriction). Merge reuses Phase F's
// dialog exactly as-is, pre-seeded with the *full* selection as its
// candidate pool (rather than a row's own auto-detected candidates, like
// the row-menu entry point uses) — the same component, two different ways
// of choosing what goes in `rows`.
export function BulkActionBar({
  rows,
  profileId,
  accountsById,
  currencySymbol,
  currencyScale,
  existingTags,
}: {
  // The current page's full row set, so selected ids can be resolved back
  // into TransactionTableRow objects for the Merge dialog's preview.
  rows: TransactionTableRow[];
  profileId: string;
  accountsById: ReadonlyMap<string, MergeCandidateAccount>;
  currencySymbol: string;
  currencyScale: number;
  existingTags: string[];
}) {
  const router = useRouter();
  const { selectedIds, clearSelection } = useTransactionWorkspace();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (selectedIds.size === 0) return null;

  const selectedIdsArray = [...selectedIds];
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));

  // Same eligibility check the Merge dialog itself re-validates on open —
  // gates the menu item (deltatransactiongridpostingrowsbulkactions20260818.md
  // §5, "only show actions valid for the current selection") so an
  // obviously-ineligible selection shows disabled with a reason rather than
  // opening a dialog that immediately says it can't merge these. Already
  // returns `eligible: false` for <2 selected, so no separate count check
  // is needed.
  const mergeEligibility = checkMergeEligibility(
    selectedRows.map((row) => toMergeCandidate(row, currencyScale)),
    accountsById,
  );

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-2.5 ring-1 ring-foreground/10">
      <span className="text-sm font-medium">
        {selectedIds.size} selected
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Menu>
          <MenuTrigger
            render={
              <Button type="button" variant="outline" size="sm">
                Bulk Actions
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
          <MenuContent>
            <MenuItem
              disabled={!mergeEligibility.eligible}
              title={mergeEligibility.eligible ? undefined : mergeEligibility.reason}
              onClick={() => setMergeOpen(true)}
            >
              <MergeIcon className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Merge</span>
            </MenuItem>
            <MenuItem onClick={() => setTagsOpen(true)}>
              <Tag className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Add/Remove Tags</span>
            </MenuItem>
            <MenuItem
              className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Delete</span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={clearSelection}>
              <X className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Clear selection</span>
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <MergeTransactionsDialog
        // Remounts (fresh pre-checked state) whenever the selection itself
        // changes — this component stays mounted across opens (only `open`
        // toggles), so its own internal `selectedIds` `useState` initializer
        // only ever runs once on first mount. Without this key, merging a
        // *different* selection after already having opened this dialog
        // once in the same page session shows stale pre-checks from the
        // first selection (found via a real second-merge click-through, not
        // theoretically — the dialog's own Merge button stayed correctly
        // disabled, "Select at least two", because the stale state didn't
        // match the new selection).
        key={selectedIdsArray.join(",")}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        profileId={profileId}
        rows={selectedRows}
        accountsById={accountsById}
        currencySymbol={currencySymbol}
        currencyScale={currencyScale}
      />
      <BulkTagsDialog
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        profileId={profileId}
        transactionIds={selectedIdsArray}
        existingTags={existingTags}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${selectedIds.size} transaction${selectedIds.size === 1 ? "" : "s"}?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const result = await bulkDeleteTransactionsAction(profileId, {
            profileId,
            transactionIds: selectedIdsArray,
          });
          if (result.success) {
            clearSelection();
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}
