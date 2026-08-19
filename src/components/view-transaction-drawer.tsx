"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AccountIcon } from "@/components/account-icon";
import { TagChips } from "@/components/tag-chips";
import type { TransactionTableRow } from "@/components/transaction-table";

// Read-only detail view for a row's full posting set (product-polish delta
// plan #5) — reuses the same TransactionTableRow shape already computed for
// the row itself, no new data fetching. Postings shown as +/- cards (money
// leaving the From account, arriving at each To account) — never
// debit/credit language (docs/08-ui-principles.md).
export function ViewTransactionDrawer({
  row,
  open,
  onOpenChange,
}: {
  row: TransactionTableRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-3 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row.description}</SheetTitle>
          <p className="text-sm text-muted-foreground">{row.date}</p>
        </SheetHeader>

        <TagChips tags={row.tags} />

        <div className="flex flex-col gap-2">
          {row.fromLines.map((line, index) => (
            <div
              key={`from-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/10"
            >
              <span className="flex items-center gap-2 text-sm">
                {line.classification && <AccountIcon classification={line.classification} icon={line.icon} />}
                {line.account}
              </span>
              <span className="font-mono tabular-nums text-sm font-medium text-destructive">
                −{line.amount}
              </span>
            </div>
          ))}

          {row.toLines.map((line, index) => (
            <div
              key={`to-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/10"
            >
              <span className="flex items-center gap-2 text-sm">
                {line.classification && <AccountIcon classification={line.classification} icon={line.icon} />}
                {line.account}
              </span>
              <span className="font-mono tabular-nums text-sm font-medium text-success">
                +{line.amount}
              </span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
