"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { checkMergeEligibility, type MergeCandidateAccount } from "@/lib/merge-eligibility";
import { toMergeCandidate } from "@/lib/transaction-rows";
import { toMinorUnits } from "@/domain";
import { formatMoney } from "@/lib/utils";
import type { TransactionTableRow } from "@/components/transaction-table";
import { mergeTransactionsAction } from "@/server/actions/transactions";

// Centered modal, not a Sheet (transactionworkspacedelta.md §11's compact
// "[Cancel] [Merge]" preview mockup, not the larger edit surface). `rows` is
// the candidate pool the caller already determined (a row's own auto-
// detected eligible candidates today; Phase G's BulkActionBar will pass its
// own selection here later) — every row starts pre-checked, and the user
// can uncheck any of them before committing. Eligibility is recomputed live
// against whatever's currently checked, using the exact same
// `checkMergeEligibility` the server re-runs — one source of truth, per its
// own doc comment.
export function MergeTransactionsDialog({
  open,
  onOpenChange,
  rows,
  accountsById,
  currencySymbol,
  currencyScale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: TransactionTableRow[];
  accountsById: ReadonlyMap<string, MergeCandidateAccount>;
  currencySymbol: string;
  currencyScale: number;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(rows.map((row) => row.id)),
  );
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const eligibility = useMemo(
    () =>
      checkMergeEligibility(
        selectedRows.map((row) => toMergeCandidate(row, currencyScale)),
        accountsById,
      ),
    [selectedRows, accountsById, currencyScale],
  );
  const totalMinorUnits = selectedRows.reduce(
    (sum, row) => sum + toMinorUnits(row.edit.amount, currencyScale),
    0,
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    setError(null);
    setIsMerging(true);
    const result = await mergeTransactionsAction({ transactionIds: [...selectedIds] });
    setIsMerging(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>Merge Transactions</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <label
              key={row.id}
              className="flex items-center gap-2.5 rounded-xl bg-muted/40 p-2.5 ring-1 ring-foreground/10"
            >
              <Checkbox checked={selectedIds.has(row.id)} onCheckedChange={() => toggle(row.id)} />
              <span className="flex-1 text-sm">
                {row.date} — {row.description}
              </span>
              <span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
                {row.fromAmount}
              </span>
            </label>
          ))}
        </div>

        {eligibility.eligible ? (
          <p className="text-sm text-muted-foreground">
            Resulting total: {formatMoney(totalMinorUnits, currencySymbol, currencyScale)}
          </p>
        ) : (
          <p className="text-sm text-destructive">{eligibility.reason}</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="button" disabled={!eligibility.eligible || isMerging} onClick={handleMerge}>
            {isMerging ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
