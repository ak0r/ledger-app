# Hand-off: 2026-08-17 session

Read `AGENTS.md` and `docs/` first (rule #1). Supersedes `HANDOFF-2026-08-16.md`
— everything that file described as "planned but not implemented" (the
`bright-questing-crab` plan) is now fully done and verified; this file covers
what came after.

## What's done, verified, and shipped this session

1. **`bright-questing-crab` plan** (generic Transaction Filter, classification
   colors, account icon picker, transaction row actions + View drawer, nav
   cleanup, Settings width, global pagination) — all items complete. Full
   detail was in the previous handoff; nothing more to say here except: done.
   `pnpm typecheck`/`lint`/`test` (142 tests)/`build` clean throughout.

2. **Transaction Workspace vNext — Phase A only** (new plan, see below).
   Scoped from a user-attached delta spec (`transactionworkspacedelta.md`,
   uploaded this session — not saved into the repo, only its content is
   reflected in the plan file) plus four chat-reported issues. Phase A:
   - Families back-nav (`/families` → `/`, reusing root's own
     `resolveFamilyEntryPath`; `/families/[id]/edit` → `/families`) +
     active-Family highlight (`bg-accent` + "Active" badge, mirrors
     `app-header.tsx`'s `FamilyItems` treatment).
   - **Real bug fixed**: Clear-filter left stale drawer state (badge count,
     open conditions) after navigating to a filter-less URL — root cause was
     `TransactionFilterDrawer`'s `useState(initialState...)` never resyncing
     on prop change across a same-route search-param nav. Fixed via
     `key={JSON.stringify(filterState)}` forcing a remount exactly when the
     URL's filter actually changes.
   - Transaction list header redesign: heading+Add grouped left,
     Filter+quick-search(+Clear) grouped right — both the global
     Transactions page and Account Detail's Transactions tab. New
     `transaction-quick-search.tsx`: types into the *same* filter model
     (upserts a `"quick-search"`-tagged description-contains condition into
     the shared `filter` query param — not a separate ad hoc state).
   - Sticky toolbar + sticky table header: new `sticky-toolbar.tsx`
     (measures its own height via `ResizeObserver`, publishes
     `--toolbar-h` on `documentElement`); `TransactionTable` gained an
     opt-in `stickyHeader` prop (global Transactions page only) whose
     header cells use `sticky top-[var(--toolbar-h)]`.

   All of Phase A: `pnpm typecheck`/`lint`/`test` (142)/`build` clean, plus
   curl+grep smoke-testing against the live dev server with real demo data
   (confirmed markup, no server-side crashes) — **not** clicked through in a
   real browser, which is exactly how the bug below was missed.

## Known bug — NOT fixed yet (explicitly deferred to next session)

**Console error on `/transactions` (and likely Account Detail too, same
pattern):**

```
Encountered two children with the same key, `{"match":"ALL","conditions":[]}"`.
```

Root cause (already diagnosed, not guessed): `TransactionFilterDrawer` and
`TransactionQuickSearch` are **sibling** elements and both got
`key={JSON.stringify(filterState)}` — React requires keys to be unique among
siblings, not just per-component-type, so when `filterState` serializes the
same way for both (always, since they always receive the same `filterState`
prop), the keys collide.

**Fix** (one line at each of 4 call sites, not yet applied): give each a
distinct prefix, e.g.:
```tsx
<TransactionFilterDrawer key={`filter-${JSON.stringify(filterState)}`} ... />
<TransactionQuickSearch key={`search-${JSON.stringify(filterState)}`} ... />
```
Sites: `src/app/f/[familyId]/m/[memberId]/(track)/transactions/page.tsx` and
`.../accounts/[accountId]/page.tsx` (both have this exact pair with the
exact same collision — Account Detail wasn't reported yet but has the
identical code shape, check it too).

## What's planned but NOT implemented yet

Full plan saved at `~/.claude/plans/iterative-wondering-moler.md` — read
that first, it's the authoritative spec (file paths, exact component
boundaries, data-flow decisions already made, don't re-derive). Summary of
remaining phases, in order:

- **Phase B** — Selection layer (`TransactionWorkspaceProvider` context:
  `selectedIds`/`quickEditRowId`/`editingTransactionId`/`openDialog`,
  reset on page/filter signature change) + checkbox column + header
  select-all + repurpose the standalone Pencil icon into a Quick Edit
  trigger (desktop only, disabled for split rows) + contextual "Merge
  Transaction" in the More menu.
- **Phase C** — Full Edit becomes a Sheet overlay, not a route. New
  `transaction-edit-drawer.tsx`; extend `buildTransactionTableRows` with a
  `row.edit` shape (raw `fromAccountId`/`amount`/`toLines`) so the Sheet
  never needs a new fetch; delete `/transactions/[transactionId]/edit`
  once nothing links to it.
- **Phase D** — Quick Edit inline row (draft state, Tab/Shift+Tab/Enter/
  Escape, saves via the same `editTransactionAction` Full Edit uses).
- **Phase E** — Split operation: adapt the existing `?split=1` shortcut to
  Phase C's `initialSplit` prop instead of a query param. No new domain
  op needed (already atomic).
- **Phase F** — Merge Transactions: new `merge-eligibility.ts` (pure,
  shared client/server), new `mergeTransactions` domain op (union of
  postings, atomic insert + cascade-delete originals), new
  `MergeTransactionsDialog` (centered Dialog, preview + confirm), two
  entry points (row menu + BulkActionBar).
- **Phase G** — Bulk operations: `BulkActionBar` (desktop-only this
  pass), bulk delete, bulk tag add/remove (reuses `TagInput`), bulk merge
  (reuses Phase F dialog).
- **Phase H** — Mobile split hierarchy (CSS branch treatment, not literal
  unicode box-drawing) + desktop split connector visual language.
- **Phase I** — Accessibility pass (new `ui/tooltip.tsx`, tooltips on all
  icon-only controls) + full walk of the delta spec's §29 acceptance
  checklist + axe-core scan.

Working agreement unchanged: one phase → verify → report → wait for
explicit go-ahead before the next phase, never auto-chained.

## Task tracker state

Tasks #1–13 (harness TaskList) are marked completed — covers the whole
`bright-questing-crab` plan plus this session's Phase A. Tasks #14–21 exist
and are `pending`, one per remaining phase (B through I) — reuse them,
don't recreate.

## Environment / state notes

- Still no git repo — don't `git init` unless asked.
- A dev server was running on `localhost:3000` during this session (PID
  visible via `next dev`'s "already running" message) — **not started by
  me**, likely the user's own; didn't kill it. Check if it's still up
  before starting another.
- Demo data used for this session's own smoke-testing (curl+grep, not a
  real browser click-through) is real data in `data/families/*.db` — a
  Family `86b8afd1-73e2-4163-beb4-672317b6052a` with Members `Aditya`
  (`d416af6b-93b2-4b88-8953-91a48a8b0b12`) and `Priya`
  (`1a827ba5-558f-4627-b17c-b7bd6c23d948`) exists there with real Accounts/
  Transactions if you need known ids for testing again.
- No Playwright/axe-core scratch install currently present (`/tmp/pw-
  scratch` convention from prior sessions) — reinstall there if doing a
  real browser pass, which Phase A's own miss (this key-collision bug)
  makes clearly worth doing before trusting curl-only smoke tests again.
- The attached delta spec (`transactionworkspacedelta.md`) was read via an
  upload path this session, not saved into the repo — its content is fully
  captured in `iterative-wondering-moler.md`, no need to re-fetch it.

## What to do next

1. Fix the key-collision bug above first (quick, isolated, both files).
2. Do an actual real-browser pass over Phase A before trusting it further
   (this bug is exactly the kind curl+grep smoke-testing can't catch).
3. Resume `~/.claude/plans/iterative-wondering-moler.md` at Phase B, same
   phase-gate cadence as always.
