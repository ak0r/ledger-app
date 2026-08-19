"use client";

// TanStack Table v9's default `useTable` is a new atom/store-based API
// (see @tanstack/react-table's useTable.d.ts). This list has no
// sorting/filtering/pagination yet (that's Phase 9) so the `/legacy`
// compat subpath — the classic data/columns/getCoreRowModel shape — is
// the right fit, not the new API's added complexity.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { flexRender } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getExpandedRowModel,
  useLegacyTable,
  type LegacyColumnDef,
  type LegacyRow,
} from "@tanstack/react-table/legacy";
import type { Classification } from "@/domain";
import { TagChips } from "@/components/tag-chips";
import { TransactionRowMenu } from "@/components/transaction-row-menu";
import { TransactionQuickEditRow } from "@/components/transaction-quick-edit-row";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { AccountIcon } from "@/components/account-icon";
import { SortableColumnHeader } from "@/components/sortable-column-header";
import { useTransactionWorkspace } from "@/components/transaction-workspace";
import { checkMergeEligibility } from "@/lib/merge-eligibility";
import { toMergeCandidate } from "@/lib/transaction-rows";
import { buildSortHref, nextSortState, type SortField, type SortState } from "@/lib/transaction-sort";
import { cn, formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Desktop-only (transactionworkspacedelta.md §12/§16 — the doc's own mobile
// mockups never show a checkbox): reads/writes the shared workspace context
// directly rather than threading `selectedIds` through the column defs, so
// clicking a checkbox only re-renders these two cells, not the whole table.
function SelectAllHeaderCheckbox({ rowIds }: { rowIds: string[] }) {
  const { selectedIds, selectAll, clearSelection } = useTransactionWorkspace();
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && rowIds.some((id) => selectedIds.has(id));
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Checkbox
            aria-label="Select all transactions on this page"
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={(checked) => (checked ? selectAll(rowIds) : clearSelection())}
          />
        }
      />
      <TooltipContent>Select all on this page</TooltipContent>
    </Tooltip>
  );
}

// Hidden on idle rows, revealed on hover (`group-hover/row`, zero extra
// state for the common single-physical-row case) or keyboard focus
// (`group-focus-within/row`) — deltatransactiongridpostingrowsbulkactions20260818.md
// §3, never `display:none` (§8) so it stays keyboard-reachable throughout.
// Selected rows keep it visible regardless (`checked`, already read here).
// `forceVisible` covers the one case pure CSS can't reach: hovering a
// *later* physical row of a split transaction, a sibling `<tr>` of the one
// this checkbox actually lives in (see `TransactionRow`'s `hoveredRowId`).
function SelectRowCheckbox({ id, forceVisible = false }: { id: string; forceVisible?: boolean }) {
  const { selectedIds, toggleSelected } = useTransactionWorkspace();
  const checked = selectedIds.has(id);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Checkbox
            aria-label="Select transaction"
            checked={checked}
            onCheckedChange={() => toggleSelected(id)}
            className={cn(
              "opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100",
              (checked || forceVisible) && "opacity-100",
            )}
          />
        }
      />
      <TooltipContent>Select transaction</TooltipContent>
    </Tooltip>
  );
}

// Shared by desktop's `TransactionRow` and mobile's `MobileTransactionCard`
// so the expandability/chevron-placement rule only lives in one place —
// Phase P found the hard way (via a real Merge Transactions test) that a
// transaction can be multi-From *and* multi-To at once (Merge doesn't
// collapse matching destinations into one posting), so "+N"/total display
// must be computed independently per side; only the chevron's placement
// picks a single side (preferring To) since one toggle only needs one
// control.
function splitInfo(t: TransactionTableRow) {
  const isMultiFrom = t.fromLines.length > 1;
  const isMultiTo = t.toLines.length > 1;
  return {
    isMultiFrom,
    isMultiTo,
    isSplit: isMultiFrom || isMultiTo,
    chevronSide: (isMultiTo ? "to" : "from") as "from" | "to",
  };
}

function rowDomId(id: string): string {
  return `transaction-row-${id}`;
}

// `text-muted-foreground` (dark mode: #878580 on the row's own
// `focus-visible:bg-muted` #282726) fails WCAG AA contrast (4.04, needs
// 4.5) — a real bug caught by this delta's own Phase O axe sweep, not
// something Phase O introduced (pre-existing since Phase K first added
// `focus-visible:bg-muted`, just never axe-tested in dark mode until now).
// `group-focus-visible/row:` bumps it to full `text-foreground` only while
// the row is actually keyboard-focused — the one state that actually
// produces the failing background — rather than changing the shared
// Flexoki `--muted-foreground` token everywhere (`text-muted-foreground`
// against the normal, much darker `--background` already passes easily).
const toAmountClassName =
  "whitespace-nowrap font-mono tabular-nums text-muted-foreground group-focus-visible/row:text-foreground";

// From/To column grouping (product refresh) — primary (spacing + a subtle
// vertical divider at the From→To boundary) plus a secondary static arrow
// (in `accountCell` below), deliberately *without* the third "barely
// perceptible lane background" tier the brief also floated: a
// `bg-foreground/[0.02]` tint was tried and dropped — it darkens dark
// mode's background just enough to push the already-marginal
// `text-muted-foreground` To Amount text (documented above: 4.04–4.46
// depending on exact background, needs 4.5) below WCAG AA, caught via a
// real axe sweep, not simplification for its own sake. The brief itself
// ranked this tier weakest ("probably not consciously notice it"), so
// dropping it entirely rather than fine-tuning a passing opacity is the
// safer trade.
const TO_LANE_BOUNDARY = "border-l border-border/60 pl-4";

// Roving-tabindex desktop grid row (deltatransactiongridconnectorkeyboard20260818.md
// §2/§3), now also owning posting-level row-expansion
// (deltachange20260818transactionexpandablesplitrowsv2.md). A transaction
// with more than one posting on either side — diverging (single From, many
// To: a manual split) or converging (many From, single To: Merge
// Transactions' output) — collapses to one summary `<tr>` by default and
// expands into one physical `<tr>` per posting, column-aligned: From/To
// account+amount land in the same `From Account`/`From Amount`/`To Account`/
// `To Amount` columns every row uses, blank where that row has no posting on
// that side. No `rowSpan` anywhere and no separate connector/direction
// column — every physical `<tr>` renders all nine columns as real `<td>`s
// (transaction-level ones — checkbox/date/description/tags/actions — only
// populated on the first physical row), so the table stays a plain ARIA
// grid (`rowSpan` has no defined behavior in the ARIA grid model) and the
// expanded view reads as a natural continuation of the table rather than a
// separate detail panel. Keyboard focus stays at the transaction level
// regardless: only the *first* physical row gets the `id`/`ref`/roving
// `tabIndex`/`onFocus`/`onKeyDown` — later posting rows are `role="row"`
// (correct table semantics) but permanently `tabIndex={-1}` and inert to
// this component's own keydown handling. ArrowUp/Down/Home/End need no
// changes for this: `rows` was always one entry per *transaction*, never
// per physical row.
//
// Body cells are hand-written here instead of going through
// `flexRender`/the column defs' `cell` functions (Phase K's approach) —
// that abstraction doesn't fit once a logical row can render a variable
// number of physical `<tr>`s. `columns` (below, in `TransactionTable`) now
// exists only to generate the header row.
//
// `event.target !== event.currentTarget` guards every shortcut in
// `onKeyDown`: these keys only fire when the `<tr>` itself holds focus, not
// a nested control (checkbox, the "..." menu button) — without this guard,
// Space on the "..." button would both open the menu (native button
// behavior) *and* toggle selection (this handler), a real double-fire bug.
function TransactionRow({
  row,
  rows,
  isFirst,
  familyId,
  memberId,
  mergeCandidates,
  accountsById,
  currencySymbol,
  currencyScale,
  hoveredRowId,
  setHoveredRowId,
}: {
  row: LegacyRow<TransactionTableRow>;
  rows: LegacyRow<TransactionTableRow>[];
  isFirst: boolean;
  familyId: string;
  memberId: string;
  mergeCandidates: TransactionTableRow[];
  accountsById: ReadonlyMap<string, { currencyId: string }>;
  currencySymbol: string;
  currencyScale: number;
  // Hover reveal for the checkbox/quick-edit icon
  // (deltatransactiongridpostingrowsbulkactions20260818.md §3) — lifted to
  // `TransactionTable` (not the shared workspace context, purely a
  // rendering concern) because a split transaction's checkbox/quick-edit
  // live only on its *first* physical `<tr>`, but hovering a *later*
  // posting row (a sibling, not a descendant) can't reveal them via pure
  // CSS `group-hover`. Every physical row of a group sets/clears the same
  // transaction id, so hovering any of them reveals the group's controls.
  hoveredRowId: string | null;
  setHoveredRowId: (updater: string | null | ((prev: string | null) => string | null)) => void;
}) {
  const { focusedRowId, setFocusedRowId, toggleSelected, openEditTransaction, setQuickEditRowId } =
    useTransactionWorkspace();
  const ref = useRef<HTMLTableRowElement>(null);
  const t = row.original;
  const { isMultiFrom, isMultiTo, isSplit, chevronSide } = splitInfo(t);
  const isExpanded = row.getIsExpanded();
  const isRovingTarget = focusedRowId === t.id || (focusedRowId === null && isFirst);
  const isHovered = hoveredRowId === t.id;
  // Referenced by non-first posting rows' `aria-describedby`
  // (deltatransactiongridpostingrowsbulkactions20260818.md §8: "treat
  // split posting rows as one transaction group for assistive technology
  // where practical") — `aria-describedby` *adds* to a row's accessible
  // description rather than replacing it the way `aria-label` would, so a
  // screen reader still reads that row's own posting content first, just
  // with an added pointer back to which transaction it belongs to.
  const descriptionId = `txn-desc-${t.id}`;

  // Restores focus to this row after Quick Edit closes (save or cancel):
  // the ternary in TableBody swaps `TransactionQuickEditRow` back to this
  // component for the same row id, which is a full unmount/remount (React
  // reconciles by type, not just key), so this fires exactly once right
  // when that swap happens — the doc's "predictable focus after editing,
  // saving, cancelling" requirement.
  useEffect(() => {
    if (focusedRowId === t.id) {
      ref.current?.focus({ preventScroll: true });
    }
    // Mount-only: restores focus on the swap back from Quick Edit, must
    // not re-fire on every focusedRowId change (ArrowUp/Down already move
    // focus imperatively themselves).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case "ArrowUp": {
        event.preventDefault();
        const index = rows.findIndex((candidate) => candidate.original.id === t.id);
        const target = rows[index - 1];
        if (target) {
          setFocusedRowId(target.original.id);
          document.getElementById(rowDomId(target.original.id))?.focus();
        }
        break;
      }
      case "ArrowDown": {
        event.preventDefault();
        const index = rows.findIndex((candidate) => candidate.original.id === t.id);
        const target = rows[index + 1];
        if (target) {
          setFocusedRowId(target.original.id);
          document.getElementById(rowDomId(target.original.id))?.focus();
        }
        break;
      }
      case "Home": {
        event.preventDefault();
        const target = rows[0];
        if (target) {
          setFocusedRowId(target.original.id);
          document.getElementById(rowDomId(target.original.id))?.focus();
        }
        break;
      }
      case "End": {
        event.preventDefault();
        const target = rows[rows.length - 1];
        if (target) {
          setFocusedRowId(target.original.id);
          document.getElementById(rowDomId(target.original.id))?.focus();
        }
        break;
      }
      case " ":
      case "Spacebar": {
        event.preventDefault();
        toggleSelected(t.id);
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (isSplit || isMultiFrom) openEditTransaction(t.id);
        else setQuickEditRowId(t.id);
        break;
      }
      default:
        break;
    }
  };

  const onMouseEnter = () => setHoveredRowId(t.id);
  const onMouseLeave = () => setHoveredRowId((prev) => (prev === t.id ? null : prev));

  const focusProps = {
    id: rowDomId(t.id),
    ref,
    tabIndex: isRovingTarget ? 0 : -1,
    onFocus: (event: React.FocusEvent<HTMLTableRowElement>) => {
      if (event.target === event.currentTarget) setFocusedRowId(t.id);
    },
    onKeyDown,
    onMouseEnter,
    onMouseLeave,
    className:
      "group/row focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
  };

  // Later posting rows of a split group aren't keyboard-focusable
  // (permanent tabIndex -1, no keydown handling — see this component's own
  // doc comment) but still need the same hover wiring as the first row so
  // hovering any of them reveals the group's checkbox/quick-edit.
  const inertRowProps = {
    tabIndex: -1,
    onMouseEnter,
    onMouseLeave,
    className: "group/row",
  };

  // Transaction-scoped cells (checkbox/date/description/tags/actions) only
  // ever carry content on a posting row's first physical `<tr>` — every
  // other physical row still renders the same `<td>`s, empty, so the table
  // stays a real grid (no `rowSpan`) instead of a set of merged cells.
  // `py-2.5` on every cell (desktop-density target: ~44-48px rows,
  // financial data still needs to scan comfortably — not the tightest
  // possible packing) — applied per-cell here rather than overriding
  // `TableCell`'s own shared `p-2` default globally, so every *other*
  // table in the app (Account balances, etc.) is unaffected.
  const transactionLevelCells = (isFirstRow: boolean) => (
    <>
      <TableCell role="gridcell" className="py-2.5">
        {isFirstRow && <SelectRowCheckbox id={t.id} forceVisible={isHovered} />}
      </TableCell>
      <TableCell role="gridcell" className="py-2.5">
        {isFirstRow && (
          <span className="whitespace-nowrap text-muted-foreground">{formatDate(t.date)}</span>
        )}
      </TableCell>
      <TableCell role="gridcell" className="py-2.5">
        {/* Description is the row's visual anchor (slightly stronger than
            the rest — not bold everywhere, just enough contrast to scan). */}
        {isFirstRow && (
          <span id={descriptionId} className="font-medium">
            {t.description}
          </span>
        )}
      </TableCell>
      <TableCell role="gridcell" className="py-2.5">
        {isFirstRow && <TagChips tags={t.tags} />}
      </TableCell>
    </>
  );

  const actionsCell = (isFirstRow: boolean) => (
    <TableCell role="gridcell" className="py-2.5">
      {isFirstRow && (
        <TransactionRowMenu
          row={t}
          familyId={familyId}
          memberId={memberId}
          onQuickEdit={setQuickEditRowId}
          mergeCandidates={mergeCandidates}
          accountsById={accountsById}
          currencySymbol={currencySymbol}
          currencyScale={currencyScale}
          quickEditForceVisible={isHovered}
        />
      )}
    </TableCell>
  );

  const accountCell = (
    line: { account: string; classification?: Classification; icon?: string | null } | undefined,
    extra?: React.ReactNode,
    side: "from" | "to" = "from",
  ) => (
    <TableCell role="gridcell" className={cn("py-2.5", side === "to" && TO_LANE_BOUNDARY)}>
      {line && (
        <span className="flex items-center gap-1.5">
          {/* Static, not the removed SVG connector — tiny, muted, fixed-
              size, purely decorative (aria-hidden). Secondary-strength cue,
              right after the primary spacing/divider treatment. */}
          {side === "to" && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          {line.classification && <AccountIcon classification={line.classification} icon={line.icon} />}
          {line.account}
          {extra}
        </span>
      )}
    </TableCell>
  );

  // Right-aligned, `tabular-nums` (equal-width digits — already set in
  // `toAmountClassName`/here, so decimals line up column-wise regardless of
  // integer-part length) — the two things that make a column of amounts
  // scannable at a glance.
  const amountCell = (amount: string | undefined, side: "from" | "to") => (
    <TableCell role="gridcell" className="py-2.5 text-right">
      {amount && (
        <span className={side === "to" ? toAmountClassName : "whitespace-nowrap font-mono tabular-nums"}>
          {amount}
        </span>
      )}
    </TableCell>
  );

  if (!isSplit) {
    const fromLine = t.fromLines[0];
    const toLine = t.toLines[0];
    return (
      <TableRow role="row" {...focusProps}>
        {transactionLevelCells(true)}
        {accountCell(fromLine)}
        {amountCell(fromLine?.amount, "from")}
        {accountCell(toLine, undefined, "to")}
        {amountCell(toLine?.amount, "to")}
        {actionsCell(true)}
      </TableRow>
    );
  }

  const toggleExpanded = () => row.toggleExpanded();
  const expandChevron = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-expanded={isExpanded}
      aria-label={isExpanded ? "Collapse transaction" : "Expand transaction"}
      onClick={toggleExpanded}
    >
      {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </Button>
  );

  if (!isExpanded) {
    const fromLine = t.fromLines[0];
    const toLine = t.toLines[0];
    const fromExtra = t.fromLines.length - 1;
    const toExtra = t.toLines.length - 1;
    // `t.fromAmount` is the transaction's already-balanced total (total
    // debit === total credit), so it's a valid stand-in for *either* side's
    // total whenever that side has more than one posting — computed
    // independently per side so a transaction that's multi on both sides at
    // once (see `isSplit`'s own comment) still shows a correct total for
    // both, not just the chevron's side.
    return (
      <TableRow role="row" {...focusProps}>
        {transactionLevelCells(true)}
        {accountCell(
          fromLine,
          <>
            {fromExtra > 0 && <span className="text-muted-foreground">+{fromExtra}</span>}
            {chevronSide === "from" && expandChevron}
          </>,
        )}
        {amountCell(isMultiFrom ? t.fromAmount : fromLine?.amount, "from")}
        {accountCell(
          toLine,
          <>
            {toExtra > 0 && <span className="text-muted-foreground">+{toExtra}</span>}
            {chevronSide === "to" && expandChevron}
          </>,
          "to",
        )}
        {amountCell(isMultiTo ? t.fromAmount : toLine?.amount, "to")}
        {actionsCell(true)}
      </TableRow>
    );
  }

  const rowCount = Math.max(t.fromLines.length, t.toLines.length, 1);
  return (
    <>
      {Array.from({ length: rowCount }, (_, index) => {
        const fromLine = t.fromLines[index];
        const toLine = t.toLines[index];
        const isFirstRow = index === 0;
        return (
          <TableRow
            key={index}
            role="row"
            {...(isFirstRow ? focusProps : inertRowProps)}
            {...(!isFirstRow ? { "aria-describedby": descriptionId } : {})}
          >
            {transactionLevelCells(isFirstRow)}
            {accountCell(fromLine, isFirstRow && chevronSide === "from" && expandChevron)}
            {amountCell(fromLine?.amount, "from")}
            {accountCell(toLine, isFirstRow && chevronSide === "to" && expandChevron, "to")}
            {amountCell(toLine?.amount, "to")}
            {actionsCell(isFirstRow)}
          </TableRow>
        );
      })}
    </>
  );
}

// Mobile card, one per transaction — every transaction shows From and To as
// separate labeled rows (never inline on one line, never an arrow/connector
// between them: the "From"/"To" label carries the direction that the now-
// removed connector column used to). Shares `splitInfo` and `row.getIsExpanded()`/
// `toggleExpanded()` with desktop's `TransactionRow` (same `LegacyRow`, same
// underlying TanStack expanded-state atom) so expand/collapse state is one
// source of truth regardless of which layout is visible at a given
// viewport width. Collapsed split transactions show only the first posting
// on the multi side, `+N`, and a chevron; expanding lists every posting on
// both sides in full (not paired by index the way desktop's column-aligned
// sub-rows are — a card has no columns to align to, so a plain per-side
// list is the natural equivalent).
function MobileTransactionCard({
  row,
  familyId,
  memberId,
  mergeCandidates,
  accountsById,
  currencySymbol,
  currencyScale,
}: {
  row: LegacyRow<TransactionTableRow>;
  familyId: string;
  memberId: string;
  mergeCandidates: TransactionTableRow[];
  accountsById: ReadonlyMap<string, { currencyId: string }>;
  currencySymbol: string;
  currencyScale: number;
}) {
  const t = row.original;
  const { isMultiFrom, isMultiTo, isSplit, chevronSide } = splitInfo(t);
  const isExpanded = row.getIsExpanded();

  const chevron = isSplit && (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-expanded={isExpanded}
      aria-label={isExpanded ? "Collapse transaction" : "Expand transaction"}
      onClick={() => row.toggleExpanded()}
    >
      {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </Button>
  );

  const showAll = !isSplit || isExpanded;
  const fromLines = showAll ? t.fromLines : t.fromLines.slice(0, 1);
  const toLines = showAll ? t.toLines : t.toLines.slice(0, 1);
  const fromExtra = showAll ? 0 : t.fromLines.length - 1;
  const toExtra = showAll ? 0 : t.toLines.length - 1;

  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="pt-0.5">
            <SelectRowCheckbox id={t.id} forceVisible />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{formatDate(t.date)}</span>
            <span className="font-medium">{t.description}</span>
          </div>
        </div>
        <TransactionRowMenu
          row={t}
          familyId={familyId}
          memberId={memberId}
          mergeCandidates={mergeCandidates}
          accountsById={accountsById}
          currencySymbol={currencySymbol}
          currencyScale={currencyScale}
        />
      </div>

      <div className="mt-2.5 flex flex-col gap-2">
        <div>
          <span className="text-xs text-muted-foreground">From</span>
          <div className="mt-0.5 flex flex-col gap-1">
            {fromLines.map((line, index) => (
              <div key={index} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-1.5">
                  {line.classification && <AccountIcon classification={line.classification} icon={line.icon} />}
                  {line.account}
                  {index === 0 && fromExtra > 0 && (
                    <span className="text-muted-foreground">+{fromExtra}</span>
                  )}
                  {index === 0 && chevronSide === "from" && chevron}
                </span>
                <span className="whitespace-nowrap font-mono tabular-nums">
                  {index === 0 && isMultiFrom && !isExpanded ? t.fromAmount : line.amount}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs text-muted-foreground">To</span>
          <div className="mt-0.5 flex flex-col gap-1">
            {toLines.map((line, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
              >
                <span className="flex items-center gap-1.5">
                  {line.classification && <AccountIcon classification={line.classification} icon={line.icon} />}
                  {line.account}
                  {index === 0 && toExtra > 0 && <span>+{toExtra}</span>}
                  {index === 0 && chevronSide === "to" && chevron}
                </span>
                <span className="whitespace-nowrap font-mono tabular-nums">
                  {index === 0 && isMultiTo && !isExpanded ? t.fromAmount : line.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {t.tags && t.tags.length > 0 && (
        <div className="mt-2.5">
          <TagChips tags={t.tags} />
        </div>
      )}
    </div>
  );
}

// Pre-resolved, display-ready rows — no debit/credit language
// (docs/08-ui-principles.md), account names already looked up server-side.
// One Transaction is one logical row even with multiple destinations
// (docs/ledger-transaction-list-change.md §3) — toLines is stacked in the
// cell, never flattened into separate table rows. `fromLines` mirrors
// `toLines` for the same reason on the credit side — see its own doc
// comment in transaction-rows.ts for why a single "from" isn't enough
// (Merge Transactions can produce more than one credit posting).
export interface TransactionTableRow {
  id: string;
  date: string;
  description: string;
  fromLines: { account: string; classification?: Classification; icon?: string | null; amount: string }[];
  fromAmount: string;
  toLines: { account: string; classification?: Classification; icon?: string | null; amount: string }[];
  tags: string[] | null;
  // Raw editable values for Full Edit's Sheet overlay (transaction-edit-
  // drawer.tsx) — see transaction-rows.ts for how these are derived.
  edit: {
    fromAccountId: string;
    amount: number;
    toLines: { accountId: string; amount: number }[];
  };
}

export function TransactionTable({
  rows,
  familyId,
  memberId,
  accounts,
  currencySymbol,
  currencyScale,
  existingTags,
  stickyHeader = false,
  footer,
  sortState = null,
  sortBaseHref,
  sortPreserve = {},
}: {
  rows: TransactionTableRow[];
  familyId: string;
  memberId: string;
  // Quick Edit's inline row (transaction-quick-edit-row.tsx) needs the same
  // account/currency/tag data Full Edit's Sheet does — threaded through
  // here rather than fetched again, same zero-extra-fetch posture as the
  // rest of the row-detail components. `currencyId` is only read for Merge
  // Transaction's eligibility scan (checkMergeEligibility needs it) — every
  // other consumer of this same array ignores it.
  accounts: { id: string; name: string; classification: string; currencyId: string }[];
  currencySymbol: string;
  currencyScale: number;
  existingTags: string[];
  // Opt-in (global Transactions page only, product-polish delta plan) —
  // sticks each header cell to `var(--toolbar-h)` (published by
  // StickyToolbar), directly beneath the page's sticky heading row.
  stickyHeader?: boolean;
  // Pagination controls (stickyHeader only — see that wrapper's own comment
  // for why). Rendered inside the same scroll container as the table, stuck
  // to *its* bottom edge (`sticky bottom-0`), rather than as a normal
  // sibling after this component like Account Detail's non-sticky table
  // still does: a plain sibling ends up in the sliver of page height left
  // over once the region above it has claimed the rest of the viewport,
  // which visually collides with whatever table content is still scrolled
  // into that same sliver. Sticking it to the bottom of the *same* scroll
  // container as `<thead>` (rather than nesting a second sticky wrapper
  // around both) keeps it reachable and unobstructed at any scroll
  // position, without stacking `position: sticky` inside `position: sticky`
  // — nesting sticky-in-sticky is unreliable in Chromium.
  footer?: React.ReactNode;
  // Sorting (src/lib/transaction-sort.ts) — `sortBaseHref` doubles as the
  // "is sorting wired up at all" flag: omitting it renders plain
  // non-interactive header text instead of a broken/dead sort link, so
  // this component still degrades safely if a future caller doesn't pass
  // it (see `SortableColumnHeader`).
  sortState?: SortState | null;
  sortBaseHref?: string;
  sortPreserve?: { filter?: string; pageSize?: string };
}) {
  const { quickEditRowId, setQuickEditRowId } = useTransactionWorkspace();
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  // See `TransactionRow`'s own doc comment on its `hoveredRowId` prop for
  // why this lives here rather than pure CSS or the shared workspace
  // context.
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, { currencyId: account.currencyId }])),
    [accounts],
  );

  // Merge Transaction's contextual entry point (transactionworkspacedelta.md
  // §11/Phase B): for each row, which *other* rows on this same page are
  // eligible to merge with it — a plain pairwise scan against
  // checkMergeEligibility (the same function the server re-runs), cheap
  // enough at page-sized row counts (≤50) to just recompute whenever `rows`
  // or `accounts` change, no incremental-update complexity needed.
  //
  // Rows with `fromLines.length > 1` (an earlier merge's own output) are
  // excluded on both sides: `toMergeCandidate` reconstructs postings from
  // `row.edit`, which only ever carries a single From posting (rule #15's
  // UI boundary — see transaction-rows.ts) — reusing it for an
  // already-multi-From row would silently under-represent its real
  // postings in this client-side scan, same class of bug the display fix
  // above exists to close. The server-side merge itself has no such
  // limitation (it re-derives from real postings), so this is purely a
  // client-side scan-reliability guard, not a hard product restriction.
  const mergeCandidatesByRowId = useMemo(() => {
    const map = new Map<string, TransactionTableRow[]>();
    for (const row of rows) {
      if (row.fromLines.length > 1) {
        map.set(row.id, []);
        continue;
      }
      const candidates = rows.filter(
        (other) =>
          other.id !== row.id &&
          other.fromLines.length === 1 &&
          checkMergeEligibility(
            [toMergeCandidate(row, currencyScale), toMergeCandidate(other, currencyScale)],
            accountsById,
          ).eligible,
      );
      map.set(row.id, candidates);
    }
    return map;
  }, [rows, accountsById, currencyScale]);

  // Header-only now (deltatransactiongridpostingrowsbulkactions20260818.md
  // §1) — body cells are hand-written in `TransactionRow` (see its own doc
  // comment for why: `rowSpan` across posting rows doesn't fit the
  // column-def/`flexRender` model). Column order here still drives header
  // order, so it must stay in sync with `TransactionRow`'s own cell order.
  const sortableHeader = (label: string, field: SortField, align?: "end") =>
    function Header() {
      const isActive = sortState?.field === field;
      return (
        <SortableColumnHeader
          label={label}
          href={sortBaseHref ? buildSortHref(sortBaseHref, sortPreserve, nextSortState(sortState, field)) : null}
          isActive={isActive}
          direction={isActive ? sortState.direction : undefined}
          align={align}
        />
      );
    };

  const columns = useMemo<LegacyColumnDef<TransactionTableRow>[]>(
    () => [
      { id: "select", header: () => <SelectAllHeaderCheckbox rowIds={rowIds} /> },
      { accessorKey: "date", header: sortableHeader("Date", "date") },
      { accessorKey: "description", header: sortableHeader("Description", "description") },
      { accessorKey: "tags", header: sortableHeader("Tags", "tags") },
      { id: "from", header: sortableHeader("From Account", "fromAccount") },
      { id: "fromAmount", header: sortableHeader("From Amount", "fromAmount", "end") },
      { id: "to", header: sortableHeader("To Account", "toAccount") },
      { id: "toAmount", header: sortableHeader("To Amount", "toAmount", "end") },
      { id: "actions", header: () => <span className="sr-only">Actions</span> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowIds, sortState, sortBaseHref, sortPreserve],
  );

  // `getExpandedRowModel` is wired purely to get real `row.getIsExpanded()`/
  // `row.toggleExpanded()` state (deltachange20260818transactionexpandablesplitrowsv2.md
  // — see docs/2026-08-18/plan.md Context section for the full reasoning).
  // `subRows` is never populated, so `table.getRowModel().rows` below still
  // yields exactly one entry per transaction, same as before this delta.
  // `getRowCanExpand` is required alongside it: the library's own default
  // (`row.subRows.length > 0`) would silently no-op every `toggleExpanded()`
  // call otherwise, since `subRows` is never populated here.
  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) => row.original.toLines.length > 1 || row.original.fromLines.length > 1,
  });

  // Desktop: dense table (docs/design/design.md §9 desktop). Mobile: compact
  // cards below, same `rows` data — one TransactionList, two presentations
  // (docs/ledger-transaction-list-change.md §17 / design.md §20). Never a
  // wide table forced into a phone viewport.
  return (
    <>
      <BulkActionBar
        rows={rows}
        familyId={familyId}
        memberId={memberId}
        accountsById={accountsById}
        currencySymbol={currencySymbol}
        currencyScale={currencyScale}
        existingTags={existingTags}
      />

      <div className="hidden md:block">
        <Table
          // Sticky-bind directly to `Table`'s own container div rather than
          // wrapping another `overflow`-establishing div around `<Table>` —
          // see `containerClassName`'s own doc comment in ui/table.tsx for
          // why a second one breaks this.
          containerClassName={cn(
            stickyHeader &&
              "sticky top-[var(--toolbar-h)] z-10 max-h-[calc(100dvh-var(--toolbar-h))] overflow-y-auto",
          )}
          footer={
            stickyHeader &&
            footer && <div className="sticky bottom-0 z-10 border-t bg-background">{footer}</div>
          }
          role="grid"
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} role="row">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    role="columnheader"
                    className={cn(
                      // Compact, slightly-stronger-than-body header text
                      // (item 2) — the header row's own subtle bottom
                      // border already comes from `TableHeader`'s shared
                      // `[&_tr]:border-b`, no filled background here.
                      "text-xs font-semibold text-foreground/90",
                      stickyHeader && "sticky top-0 z-10 bg-background",
                      (header.id === "fromAmount" || header.id === "toAmount") && "text-right",
                      // A FROM/TO group-label row was explicitly ruled out
                      // (would make the header taller) — the divider alone
                      // is enough signal at this level.
                      header.id === "to" && TO_LANE_BOUNDARY,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row, index) =>
              row.original.id === quickEditRowId ? (
                <TransactionQuickEditRow
                  key={row.id}
                  row={row.original}
                  familyId={familyId}
                  memberId={memberId}
                  accounts={accounts}
                  currencySymbol={currencySymbol}
                  currencyScale={currencyScale}
                  existingTags={existingTags}
                  onCancel={() => setQuickEditRowId(null)}
                />
              ) : (
                <TransactionRow
                  key={row.id}
                  row={row}
                  rows={table.getRowModel().rows}
                  isFirst={index === 0}
                  familyId={familyId}
                  memberId={memberId}
                  mergeCandidates={mergeCandidatesByRowId.get(row.original.id) ?? []}
                  accountsById={accountsById}
                  currencySymbol={currencySymbol}
                  currencyScale={currencyScale}
                  hoveredRowId={hoveredRowId}
                  setHoveredRowId={setHoveredRowId}
                />
              ),
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {table.getRowModel().rows.map((row) => (
          <MobileTransactionCard
            key={row.id}
            row={row}
            familyId={familyId}
            memberId={memberId}
            mergeCandidates={mergeCandidatesByRowId.get(row.original.id) ?? []}
            accountsById={accountsById}
            currencySymbol={currencySymbol}
            currencyScale={currencyScale}
          />
        ))}
      </div>
    </>
  );
}
