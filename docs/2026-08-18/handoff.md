# Hand-off: 2026-08-18 session

Read `AGENTS.md` and `docs/` first (rule #1).

**New convention starting today**: session hand-offs and delta plans now
live under `docs/YYYY-MM-DD/` (this folder), not as root-level
`HANDOFF-*.md` files. `docs/2026-08-16/handoff.md` and
`docs/2026-08-17/handoff.md` are the two prior sessions' hand-offs, moved
here unchanged for consistency — no content was altered, only relocated.

This file replaces the previous root-level `HANDOFF-2026-08-18.md`, whose
content is fully superseded (everything it described is done and verified
— nothing was pending). See git-less-repo caveat below if you need any of
that prose back — it isn't recoverable, only the code and this summary are.

## What's done, verified, and shipped today

Three delta specs, all fully shipped and verified this session, each
phase-gated (implement → `typecheck`/`lint`/`test`/`build` → real-browser
Playwright + axe-core → report → wait for go-ahead):

1. **Transaction Workspace vNext, Phases A–I** — selection layer, Full Edit
   as a Sheet overlay, Quick Edit inline row, Split, Merge Transactions,
   bulk operations, mobile/desktop split visual language, accessibility
   pass.
2. **Delta 2 — SVG connector + keyboard navigation** — dedicated "Direction"
   column with a bezier-curve connector (later replaced, see Delta 3);
   roving-tabindex keyboard nav (`ArrowUp/Down/Home/End`, `Space`, `Enter`,
   `Ctrl/Cmd+Enter`), `role="grid"/"row"/"gridcell"` throughout.
3. **Delta 3 — Posting rows & bulk actions** — split transactions render
   one physical `<tr>` per destination posting (`rowSpan` on
   transaction-level cells), orthogonal right-angle connector with
   arrowheads (replacing Delta 2's bezier curves), checkbox/quick-edit
   idle-hidden with hover/focus reveal, single "Bulk Actions ▾" dropdown
   extended to mobile, `aria-describedby` linking split posting rows to
   their transaction, a real dark-mode WCAG contrast bug found and fixed.

Current shared-component state going into Delta 4: `TransactionTable`
(`src/components/transaction-table.tsx`) renders **every** split
transaction's postings as separate `<tr>`s **always expanded** — this is
exactly what Delta 4 (below) changes to collapsed-by-default.

## What's next — Delta 4 (not started)

**Delta 4 — Expandable Split Transactions**
(`deltachange20260818transactionexpandablesplitrowsv2.md`, uploaded
2026-08-18). Full plan at `docs/2026-08-18/plan.md` — read that file in
full before starting, it's the authoritative spec (exact file paths,
component boundaries, and several judgment calls already made and
justified there, don't re-derive).

One-paragraph summary: split transactions become **collapsed by default**
(one row: first destination + "+N" + a disclosure chevron + simple
connector line), expanding on click into Delta 3's existing per-posting
`<tr>` layout. Uses TanStack's real `row.getIsExpanded()`/
`toggleExpanded()` state (not its subRows/tree-data model — see the plan's
own Context section for why). Also a full mobile card redesign: every
transaction (even plain 1→1 ones) shows From and To as separate rows,
never inline on one line. Three phases: **P** (collapse/expand
infrastructure + desktop rendering), **Q** (mobile card redesign), **R**
(accessibility pass + full acceptance-checklist walk).

Two explicit scope exclusions already decided (see plan for reasoning):
quantity/price fields (don't exist in the domain at all) and an "Unsplit"
action (doesn't exist, phrased as non-mandatory in the source doc).

**Status: plan written and complete, zero implementation started.** Next
step is literally "start Phase P" whenever picked back up — no other
prep work outstanding.

## Environment / state notes

- Still no git repo.
- Dev server runs on `localhost:3000` — check if still up before starting
  another.
- Playwright + axe-core scratch install lives in `/tmp/pw-scratch` (not
  committed) — reinstall there if missing.
- Demo data: Family `86b8afd1-73e2-4163-beb4-672317b6052a`, Members
  `Aditya` (`d416af6b-93b2-4b88-8953-91a48a8b0b12`) and `Priya`
  (`1a827ba5-558f-4627-b17c-b7bd6c23d948`). Baseline transaction count:
  **1199**, 0 orphan postings — verify this after any test-data cleanup.
- Bash tool `cwd` repeatedly drifts to `/tmp/pw-scratch` after Playwright
  runs — always `cd` explicitly before project or Playwright commands.
- Any test that *saves*/mutates data must run against throwaway rows
  created via direct `better-sqlite3` inserts, not real demo rows — a
  session earlier this week hit exactly this mistake once; caught and
  restored, but worth remembering.
