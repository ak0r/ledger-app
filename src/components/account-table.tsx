"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import type { AccountWithBalance } from "@/server/services/accounts";
import {
  buildAccountSortHref,
  nextAccountSortState,
  type AccountSortField,
  type AccountSortState,
} from "@/lib/account-sort";
import { cn, formatMoney, humanizeEnum } from "@/lib/utils";
import { useAccountWorkspace } from "@/components/account-workspace";
import { SortableColumnHeader } from "@/components/sortable-column-header";
import { AccountIcon } from "@/components/account-icon";
import { AccountFormSheet } from "@/components/account-form-sheet";
import { ArchiveAccountButton } from "@/components/archive-account-button";
import { TagChips } from "@/components/tag-chips";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Accounts list table — same visual/interaction language as
// transaction-table.tsx (sortable headers, hover-reveal row controls,
// checkbox selection + Bulk Actions), scaled down to Accounts' much
// simpler shape: every row is exactly one physical `<tr>` (no split/merge
// multi-row rendering, no expand/collapse), so hover-reveal is pure CSS
// `group-hover` with no `hoveredRowId` JS state, and there's no roving-
// tabindex keyboard grid — native Tab order through the checkbox/name
// link/edit button/archive button already works.
function SelectAllCheckbox({ ids }: { ids: string[] }) {
  const { selectedIds, selectAll, clearSelection } = useAccountWorkspace();
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && ids.some((id) => selectedIds.has(id));
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Checkbox
            aria-label="Select all accounts"
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={(checked) => (checked ? selectAll(ids) : clearSelection())}
          />
        }
      />
      <TooltipContent>Select all</TooltipContent>
    </Tooltip>
  );
}

function SelectRowCheckbox({ id }: { id: string }) {
  const { selectedIds, toggleSelected } = useAccountWorkspace();
  const checked = selectedIds.has(id);
  return (
    <Checkbox
      aria-label="Select account"
      checked={checked}
      onCheckedChange={() => toggleSelected(id)}
      className={cn(
        "opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(pointer:coarse)]:opacity-100",
        checked && "opacity-100",
      )}
    />
  );
}

export function AccountTable({
  accounts,
  currencyCode,
  currencySymbol,
  currencyScale,
  existingTags,
  sortState,
  sortBaseHref,
  sortPreserve,
}: {
  accounts: AccountWithBalance[];
  currencyCode: string;
  currencySymbol: string;
  currencyScale: number;
  existingTags: string[];
  sortState: AccountSortState | null;
  sortBaseHref: string;
  sortPreserve: Record<string, string>;
}) {
  const ids = accounts.map((a) => a.id);

  const sortableHeader = (label: string, field: AccountSortField, align?: "end") => {
    const isActive = sortState?.field === field;
    return (
      <SortableColumnHeader
        label={label}
        href={buildAccountSortHref(sortBaseHref, sortPreserve, nextAccountSortState(sortState, field))}
        isActive={isActive}
        direction={isActive ? sortState.direction : undefined}
        align={align}
      />
    );
  };

  return (
    <div className="overflow-x-auto">
      <Table role="grid">
        <TableHeader>
          <TableRow role="row">
            <TableHead role="columnheader">
              <SelectAllCheckbox ids={ids} />
            </TableHead>
            <TableHead role="columnheader" className="text-xs font-semibold text-foreground/90">
              {sortableHeader("Name", "name")}
            </TableHead>
            <TableHead role="columnheader" className="text-xs font-semibold text-foreground/90">
              {sortableHeader("Classification", "classification")}
            </TableHead>
            <TableHead role="columnheader" className="text-xs font-semibold text-foreground/90">
              {sortableHeader("Type", "accountType")}
            </TableHead>
            <TableHead role="columnheader" className="text-right text-xs font-semibold text-foreground/90">
              {sortableHeader("Balance", "balance", "end")}
            </TableHead>
            <TableHead role="columnheader" className="text-xs font-semibold text-foreground/90">
              {sortableHeader("Tags", "tags")}
            </TableHead>
            <TableHead role="columnheader">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id} role="row" className="group/row">
              <TableCell role="gridcell" className="py-2.5">
                <SelectRowCheckbox id={account.id} />
              </TableCell>
              <TableCell role="gridcell" className="py-2.5">
                <Link
                  href={`/accounts/${account.id}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <AccountIcon classification={account.classification} accountType={account.accountType} icon={account.icon} />
                  <span className="font-medium">{account.name}</span>
                </Link>
                {account.isArchived && (
                  <Badge variant="outline" className="ml-2">
                    Archived
                  </Badge>
                )}
              </TableCell>
              {/* Deliberately plain text, not colored per classification
                  (design-audit decision, 2026-08-20, refined 2026-09-02) —
                  the rule isn't "color only lives on icons," it's that color
                  shouldn't repeat across dense, scannable rows where it
                  becomes noise. This is a list: names/values stay neutral,
                  color stays on the icon. A single hero figure (a summary
                  Card, e.g. dashboard-panels/card-panel-figure.tsx) is the
                  opposite case — one number, nothing to compete with, color
                  reinforces meaning instead of adding noise. Don't add
                  per-classification text color to this list. */}
              <TableCell role="gridcell" className="py-2.5">
                {humanizeEnum(account.classification)}
              </TableCell>
              <TableCell role="gridcell" className="py-2.5">
                {account.accountType ? humanizeEnum(account.accountType) : ""}
              </TableCell>
              <TableCell role="gridcell" className="py-2.5 text-right">
                <span className="whitespace-nowrap font-mono tabular-nums">
                  {formatMoney(account.balance, currencySymbol, currencyScale)}
                </span>
              </TableCell>
              <TableCell role="gridcell" className="py-2.5">
                <TagChips tags={account.tags} />
              </TableCell>
              <TableCell role="gridcell" className="py-2.5">
                <div className="flex justify-end gap-1.5 [@media(pointer:coarse)]:gap-3">
                  <AccountFormSheet
                    mode="edit"
                    currencies={[]}
                    existingTags={existingTags}
                    account={{
                      id: account.id,
                      currencyId: account.currencyId,
                      currencyCode,
                      name: account.name,
                      classification: account.classification,
                      // Post-backfill, every real Account has a non-null
                      // accountType — DB nullability is only a Migration 1
                      // "add" artifact (see schema.ts), never actually null.
                      accountType: account.accountType ?? "BANK",
                      instrumentId: account.instrumentId,
                      instrumentLabel: account.instrumentLabel,
                      tags: account.tags,
                      icon: account.icon,
                    }}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit account"
                        className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    }
                  />
                  {!account.isArchived && (
                    <div className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                      <ArchiveAccountButton accountId={account.id} variant="ghost" />
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
