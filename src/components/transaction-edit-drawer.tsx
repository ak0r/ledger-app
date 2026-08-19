"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TransactionForm } from "@/components/transaction-form";
import { useTransactionWorkspace } from "@/components/transaction-workspace";
import type { TransactionTableRow } from "@/components/transaction-table";

// Full Edit as a Sheet overlay, not a route (transactionworkspacedelta.md
// §5) — replaces `/transactions/[transactionId]/edit`. Mounted once per
// page (not per row, unlike ViewTransactionDrawer) since it needs the
// page's own accounts/currency/tags data; reads which row to edit from the
// shared workspace context instead of a row-scoped prop. `row.edit`
// (transaction-rows.ts) already carries the raw fromAccountId/amount/
// toLines TransactionForm needs, computed server-side alongside the rest of
// the row — no extra fetch when the Sheet opens.
export function TransactionEditDrawer({
  rows,
  familyId,
  memberId,
  accounts,
  currencySymbol,
  currencyScale,
  existingTags,
}: {
  rows: TransactionTableRow[];
  familyId: string;
  memberId: string;
  accounts: { id: string; name: string; classification: string }[];
  currencySymbol: string;
  currencyScale: number;
  existingTags: string[];
}) {
  const { editingTransactionId, editingInitialSplit, closeEditTransaction } = useTransactionWorkspace();
  const row = rows.find((candidate) => candidate.id === editingTransactionId);

  return (
    <Sheet open={row !== undefined} onOpenChange={(open) => !open && closeEditTransaction()}>
      <SheetContent className="max-w-md gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Transaction</SheetTitle>
        </SheetHeader>
        {row && (
          <TransactionForm
            key={row.id}
            mode="edit"
            familyId={familyId}
            memberId={memberId}
            accounts={accounts}
            currencySymbol={currencySymbol}
            currencyScale={currencyScale}
            existingTags={existingTags}
            initialSplit={editingInitialSplit}
            transaction={{
              id: row.id,
              date: row.date,
              description: row.description,
              tags: row.tags,
              fromAccountId: row.edit.fromAccountId,
              amount: row.edit.amount,
              toLines: row.edit.toLines,
            }}
            onCancel={closeEditTransaction}
            onSuccess={closeEditTransaction}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
