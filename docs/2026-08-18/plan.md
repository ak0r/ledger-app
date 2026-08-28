# Delta 4: Expandable Split Transactions

> **Status note (2026-08-28):** Shipped and re-verified against the
> current `src/components/transaction-table.tsx`/`transaction-row-menu.tsx`
> — `getExpandedRowModel`/`row.getIsExpanded()`/`row.toggleExpanded()`
> wiring, collapsed-by-default split rows with a disclosure chevron
> (`aria-expanded`, `ChevronRight`/`ChevronDown`), and the mobile card
> redesign (From/To always separate rows) are all present exactly as
> Phases P/Q below describe. Closes the "not re-verified" note carried
> since the 2026-08-26 hand-off.

## Context

Fourth delta spec today (`deltachange20260818transactionexpandablesplitrowsv2.md`).
Delta 3 (Phases L–O: posting-level visual rows always expanded, orthogonal
connector, hover-reveal controls, bulk-actions dropdown) is fully shipped
and verified — see `docs/2026-08-18/handoff.md`.

This delta is a genuine **pivot**, not an addition: split transactions
should be **collapsed by default** (one row, showing the first destination
+ "+N more" + a disclosure chevron), expanding on click into the
one-row-per-posting layout Phase L already built. Phase L's row-expansion
*rendering* (rowSpan on transaction-level cells, one `<tr>` per posting,
roving-tabindex on the first physical row only) is reused almost entirely
— what's new is gating it behind an actual expand/collapse toggle, plus a
collapsed-state summary rendering, plus a full mobile card redesign.

**Explicit technical decision — TanStack's real expanded-row *state*, not
its subRows/tree-data model.** The delta says "use TanStack Table's
expandable-row capability" but also "do not flatten postings into the
table's primary data array" and "pagination/sorting/filtering/selection
operate on transactions, not postings." TanStack's `subRows`/
`getExpandedRowModel()` machinery is designed for genuinely hierarchical
data (flattening child rows into the visible row list) — using it literally
would mean modeling postings as `subRows`, which is exactly the
"flattening" the delta says not to do. Resolution: enable the row-expanding
feature slot (pass the `getExpandedRowModel()` v8-compat marker alongside
the existing `getCoreRowModel()` one, same pattern) purely to get
`row.getIsExpanded()` / `row.toggleExpanded()` as real TanStack state —
never call `table.getExpandedRowModel()`'s own output, never populate
`row.subRows`. Posting sub-rows stay exactly what Phase L already built:
hand-rendered extra `<tr>`s, now conditionally shown. This satisfies the
delta's own §7 diagram ("expanded state" as a step *inside* the TanStack
pipeline) without fighting the tree-data model or touching pagination.

**Connector geometry — rounded joins on straight lines, not true arcs.**
The reference FinBodhi SVGs (explicitly "visual references only... do not
copy path definitions verbatim") use quarter-circle arcs. Phase L's
existing connector already uses `preserveAspectRatio="none"` so one SVG
can non-uniformly stretch to match variable row heights without
recomputing per height — a real arc stretched non-uniformly renders as a
distorted ellipse-quarter, not a clean rounded corner. None of the delta's
own connector bullets (§5) actually require *rounded* corners specifically
— they require correct topology (straight/branching/converging), column
containment, and alignment, all of which Phase L's sharp-elbow paths
already satisfy. Keeping straight elbows with `strokeLinejoin="round"`
(already set in Phase L) gives a visibly soft corner without true arc
geometry — a different, Ledger-original technique from the references, not
a partial copy of their approach. Only new geometry actually needed: a
"collapsed" mode that always draws the plain single-line shape regardless
of real posting count (call the existing whole-cell connector with
`toCount` forced to `1`).

**Two explicit scope exclusions** (AGENTS.md rule #18 — no deferred modules
without an architecture decision):
- **§12 Quantity/Price**: grepped the domain/schema — no `quantity`/`price`
  fields exist anywhere. Investment postings aren't a real feature yet.
  Not building UI for data that doesn't exist.
- **"Unsplit" action** (§9's action list): grepped — no such operation
  exists today (only in my own doc-comments referencing the *concept*).
  Phrased as "possible actions include," same non-mandatory framing as
  Delta 3's "suggested" bulk actions list (which correctly excluded
  Export/Bulk-Edit). A real "split one transaction into N independent
  transactions" domain operation is new backend work, out of scope here.

Phase-gated as always: implement, verify (`typecheck`/`lint`/`test`/`build`
+ real-browser Playwright + axe-core + throwaway-data cleanup with a
before/after count check — baseline 1199 transactions, 0 orphan postings),
report, wait for explicit go-ahead.

---

## Phase P — Collapse/expand infrastructure + desktop rendering

### TanStack wiring (`transaction-table.tsx`)

Add `getExpandedRowModel: getExpandedRowModel()` to the `useLegacyTable`
options (import from `@tanstack/react-table/legacy`, same marker-import
pattern as `getCoreRowModel`). No `enableExpanding`/`subRows` needed —
every row is independently toggleable via `row.getIsExpanded()`/
`row.toggleExpanded()` regardless of `subRows` (that machinery is a
separate state slice from the actual row-model flattening). Continue using
`table.getRowModel().rows` exactly as today for iteration — with no
`subRows` ever populated, expansion state doesn't change what that array
contains.

### `TransactionRow` — collapsed vs. expanded desktop rendering

`isSplit = t.toLines.length > 1` (unchanged). New: `isExpanded =
row.getIsExpanded()`.

- **`!isSplit`**: unchanged from Phase L — one row, no chevron (nothing to
  disclose).
- **`isSplit && !isExpanded`** (default): one physical row.
  - Transaction-level cells: unchanged.
  - Connector: `<PostingDirection fromCount={t.fromLines.length}
    toCount={1} />` — forces the plain single-line shape regardless of the
    real posting count (the "collapsed state uses a simple directional
    connector" requirement, reusing existing geometry with a fixed arg,
    zero new connector code).
  - To Account cell: first posting's icon + account name, then a muted
    `" +N"` suffix (`N = toLines.length - 1`), then a chevron
    (`ChevronRight`) icon-button — `aria-expanded={false}`,
    `aria-label="Expand transaction"`, `onClick` calls
    `row.toggleExpanded()`. Chevron placement matches the delta's own
    ASCII (`Home Loan +1  ▾`), no new column needed.
  - To Amount cell: `t.fromAmount` (already-computed total credit — by
    double-entry balance this equals the total debit too, exactly the
    "collapsed To Amount represents the total destination amount"
    requirement, no new computed field needed).
- **`isSplit && isExpanded`**: Phase L's existing multi-`<tr>` structure,
  verbatim, except the first physical row's To Account cell also gets a
  chevron (`ChevronDown`, `aria-expanded={true}`, `aria-label="Collapse
  transaction"`) in the same spot, toggling back.

### Verification
Real-browser: collapsed split transaction shows "Account +N" + chevron +
one straight connector line + total amount, occupies exactly one `<tr>`;
clicking the chevron expands into Phase L's per-posting rows (re-verify
`rowSpan`, roving-tabindex-on-first-row-only, `aria-describedby` all still
correct — this is mostly regression-checking Phase L under the new
default-collapsed condition); clicking again collapses back; unsplit rows
unaffected (no chevron); `row.toggleExpanded()` state doesn't survive a
page/filter change (same `key={rowIds.join(",")}`-driven remount as
everything else — acceptable, matches "expanded/collapsed state is UI
state, not persisted" and every other transient-state reset convention
this session already established).

---

## Phase Q — Mobile card redesign

Full replacement of the mobile card block in `transaction-table.tsx`
(currently: inline "From → To" for single-posting rows, `branchLineClassName`
CSS stacking only when `fromLines.length > 1` or `toLines.length > 1`).

New uniform structure for **every** transaction, per §11's "core mobile
rule" — From and To are always separate rows, even for a plain 1→1
transaction:

```
[date]                              [pencil? no — mobile has no quick-edit] [...]
[description]

[from account]                                          [from amount]
  → [to account]  (or ├─/└─ per posting when split)      [to amount]
```

- Collapsed split (default): show only the first destination row + a
  `chevron` + `"+N"`, mirroring desktop.
- Expanded split: one indented destination row per posting, connector
  prefix (reuse the same per-row `PostingDirection`/`SplitConnector`
  fragment components Phase P touches, not a separate mobile-only
  connector).
- Amounts right-aligned consistently (`ml-auto` / a fixed two-column flex
  row, not inline text immediately after the account name — the delta's
  own explicit anti-pattern to avoid).
- Visual hierarchy per §11: description strongest, From primary emphasis,
  To slightly secondary (existing `text-muted-foreground` on destination
  lines already does this), connector muted structural (already
  `text-muted-foreground` at reduced opacity), date/actions compact
  secondary (unchanged).
- Checkbox/`...` menu placement unchanged from Phase N. Still no
  quick-edit icon on mobile (unchanged).

### Verification
Real-browser at a mobile viewport: plain salary-style transaction shows
From/To as two separate rows (not inline); collapsed split shows one
destination + "+N" + chevron; expanding reveals all postings, indented,
connector visible; amounts align to a consistent right edge across
different-length account names; no horizontal scroll at 360–400px widths.

---

## Phase R — Accessibility pass + acceptance-checklist walk

Full walk of the delta's own §16 acceptance criteria (mirrors Phase
I/O precedent). Specific checks beyond what Phases P/Q already verify:
`aria-expanded`/accessible labels on both chevron states; disclosure
button reachable via Tab and activatable via Enter/Space (native button
behavior — no custom keydown needed); confirm the delta's §10 keyboard
list (Up/Down/Space/Enter/Escape, all already correct from Phase K/L) is
untouched by expand/collapse — no new key is bound to toggling expansion,
matching the delta's own keyboard section, which doesn't list one; confirm
pagination/filtering counts stay transaction-scoped regardless of any
row's expand state (already true — expansion never changes `rows.length`);
axe-core sweep across collapsed/expanded/mobile states, including dark
mode (re-run the same combinations Phase O already covers, now against the
new collapsed-by-default default state).

## Verification (every phase)
`pnpm typecheck && pnpm lint && pnpm test && pnpm build`, real-browser
Playwright against live demo data (family
`86b8afd1-73e2-4163-beb4-672317b6052a`, member
`d416af6b-93b2-4b88-8953-91a48a8b0b12`), axe-core scan, cleanup of any
throwaway test rows with a before/after count check (baseline: 1199
transactions, 0 orphan postings).
