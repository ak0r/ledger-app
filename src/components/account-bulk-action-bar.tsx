"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AccountBulkTagsDialog } from "@/components/account-bulk-tags-dialog";
import { useAccountWorkspace } from "@/components/account-workspace";
import { bulkArchiveAccountsAction } from "@/server/actions/accounts";

// Renders above the Accounts table once any row is selected — same "one
// Bulk Actions dropdown" posture as Transactions' BulkActionBar. Scoped to
// Archive + Tags only (not a bulk classification/instrument-type change —
// that's a much riskier operation with no Transactions precedent either,
// and not what was asked for); Archive is Accounts' equivalent of
// Transactions' bulk Delete (Accounts don't have a delete operation at
// all, only archive).
export function AccountBulkActionBar({ existingTags }: { existingTags: string[] }) {
  const router = useRouter();
  const { selectedIds, clearSelection } = useAccountWorkspace();
  const [tagsOpen, setTagsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (selectedIds.size === 0) return null;

  const selectedIdsArray = [...selectedIds];

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-2.5 ring-1 ring-foreground/10">
      <span className="text-sm font-medium">{selectedIds.size} selected</span>
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
            <MenuItem onClick={() => setTagsOpen(true)}>
              <Tag className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Add/Remove Tags</span>
            </MenuItem>
            <MenuItem onClick={() => setArchiveOpen(true)}>
              <Archive className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Archive</span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={clearSelection}>
              <X className="size-3.5" aria-hidden="true" />
              <span className="ml-2">Clear selection</span>
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <AccountBulkTagsDialog
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        accountIds={selectedIdsArray}
        existingTags={existingTags}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${selectedIds.size} account${selectedIds.size === 1 ? "" : "s"}?`}
        description="Archived accounts are hidden from active use. Their existing Transactions and balances are unaffected."
        confirmLabel="Archive"
        onConfirm={async () => {
          const result = await bulkArchiveAccountsAction({ accountIds: selectedIdsArray });
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
