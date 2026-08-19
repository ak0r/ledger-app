# Hand-off: 2026-08-16 session

Read `AGENTS.md` and `docs/` first (rule #1). This file is a pointer/status
snapshot, not a replacement for the actual docs. Supersedes the previous
`HANDOFF.md` (removed — this session moved far past its content: onboarding,
a full product-polish pass, and a second in-progress polish delta).

## What's actually done, verified, and shipped this session

In order:

1. **Design review** of the FinBodhi-inspired UI refresh (no code changes,
   review only) — findings later implemented in the "product polish pass"
   below.
2. **Onboarding feature** (`docs/onboarding.md`): real Family
   creation → Setup (Demo Data / Start from Scratch) → Member(s) → Primary
   Member decision tree, a native demo-data generator (2 Members, ~25
   Accounts, 1000+ transactions, seeded/deterministic), a durable
   `isPrimary` column on `members` (replacing cookie-only "active member"
   for return-visit routing), Clean Up Content, and a real per-Family
   migration catch-up fix in `family-client.ts` (Drizzle's own migrator +
   a one-time journal backfill for pre-existing Family databases) —
   without which the next schema change would have silently broken every
   already-provisioned Family.
3. **Product polish pass** (large, fully complete and verified):
   - Tags migrated `Record<string,string>` → `string[]` end to end
     (schema/use-cases/Zod/filters/forms/demo data/tests/docs) — no
     normalized Tag entity introduced, existing local data converted via a
     one-time script, no permanent compat shim left behind.
   - **Real font bug fixed**: `globals.css` had `--font-sans: var(--font-sans)`
     (self-referencing/invalid) instead of pointing at `--font-geist-sans`
     — the whole app had been rendering in a fallback font this whole
     time. Verified via computed `font-family`, not just visual check.
   - All 8 native `<select>`s replaced with a real `Select`
     (`src/components/ui/select.tsx`, `@base-ui/react/select`) — native
     selects can't be reliably styled for their open listbox, which was
     the actual cause of "dropdowns are unreadable when opened." Header's
     Family/Member switcher rebuilt on `@base-ui/react/menu`
     (`ui/menu.tsx`) for real keyboard nav.
   - **Real functional bug fixed**: "New Transaction" silently bounced
     back to the list with 0–1 Accounts (destination route requires ≥2,
     the button linking to it was never gated on that). Now gated with
     explicit guidance, never a silent bounce.
   - Add/Edit Account redesigned: card-based Classification selector,
     "Instrument Type" → "Account Type", Label + Opening Balance
     field/mechanism removed entirely (an opening balance is now a normal
     Transaction against a Balancing Account, not special creation-time
     state).
   - Account Detail rebuilt around **Transactions / History / Settings**
     tabs (route-based: `/accounts/[id]`, `/accounts/[id]/history`,
     `/accounts/[id]/settings` — deliberately not a client-state Tabs
     primitive, to avoid colliding with the Transactions tab's own
     pagination/filter query params). History has real cashflow + balance-
     trend charts (Recharts — new dependency, decision documented in the
     polish-pass report, not previously approved or excluded by name).
     Settings hosts Tags/Currency/edit fields/Archive, replacing the old
     standalone `/accounts/[id]/edit` route (now deleted). Transactions
     tab got a description-search filter drawer + pagination (20/50,
     default 20) — Account Detail only, at the time.
   - **Family deletion added** — real hard delete (registry row + the
     Family's physical `.db`/WAL/SHM files, connection evicted from the
     in-memory cache first), confirmation names the Family and everything
     it owns, cookies cleared if they pointed at the deleted Family.
     Supersedes the earlier "leave the action out" interim choice
     (contract §15 only forbade a *fake* deletion).
   - Two pre-existing marginal WCAG AA contrast misses fixed
     (`--muted-foreground`, `--success`), found via a real axe-core scan
     across every touched screen (0 violations after).
   - One real bug found *during* this session's own verification and
     fixed: the Transactions filter Selects (Server Component) crashed
     with "Functions are not valid as a child of Client Components" —
     passing a label-lookup function as `children` into a Client Component
     across the RSC boundary isn't serializable. Fixed using `Select`'s
     `items` prop (plain data) instead; every other `Select` usage lives
     inside an already-`"use client"` form, where this doesn't apply.
   - Full detail in `CHANGELOG.md`'s `[Unreleased] → Product polish pass`
     entry — that's the authoritative "what actually shipped" record, not
     this file.

All of the above: `pnpm typecheck`/`lint`/`test` (120 tests)/`build` clean,
verified in a real headless browser across light/dark/mobile/desktop, axe-
core scan clean.

## What's planned but NOT implemented yet

A second polish delta was scoped (Plan Mode) this session but not started —
the user asked to stop and save state instead of proceeding. **Full plan is
saved at `~/.claude/plans/bright-questing-crab.md`** — read that file
first if picking this up. Summary:

1. **Generic reusable `TransactionFilter` model** (`src/lib/transaction-filter.ts`,
   not started) — condition-based (field/operator/value, ANY/ALL groups),
   fields: description, from-account, to-account, amount, date, tags,
   is-split; each with its own operator set (see the plan file for the
   exact list per field). Meant to replace the current ad hoc single-field
   filters on both `/transactions` and Account Detail's Transactions tab,
   and to be reusable later for Spaces/reports. Decision already made (not
   blocking): serialize the whole filter state as one JSON-encoded query
   param, since the condition-builder UI needs real client state while
   being drafted (unlike the old simple zero-JS GET forms).
2. **Account icon picker** — the `icon` column on `accounts` has existed
   and been wired through `createAccount`/`editAccount`/Zod schemas since
   Phase 8, but no form has ever exposed it. Plan: `lucide-react/dynamic`'s
   `iconNames` (~2025 kebab-case names, confirmed via Explore-agent
   research this session) + `<DynamicIcon>`, search-filtered picker, no
   manually maintained icon list. `AccountIcon` gains an optional `icon`
   prop, falls back to the existing per-classification default when unset.
3. **Two classification colors need correcting** to match an explicit
   required mapping (Income=green, Expense=red, Liability=amber,
   Asset=blue, Balancing=purple): `--category-liability` is currently
   orange (should reuse `--warning`), `--category-expense` is currently
   magenta (should reuse `--destructive`). Asset/Income/Balancing already
   match, no change needed there.
4. **Transaction row actions**: replace the current text Edit/Delete
   buttons with an icon-only Edit + a "More" menu (View Transaction / Edit
   / Split Transaction / Delete), plus a new read-only View Transaction
   drawer (Sheet, Postings shown as cards). "Split Transaction" decision:
   shortcut into Edit with a blank destination line pre-added, shown only
   on transactions that aren't already split.
5. **Real layout bug identified, not yet fixed**: `ui/table.tsx`'s shared
   `TableCell` forces `whitespace-nowrap` on every cell (shared with the
   Accounts list too) — this is what clips long Account names in a split
   transaction's stacked "To" lines. Fix: remove the blanket nowrap from
   `TableCell`, apply it only where actually wanted (Date/Amount columns).
   Also add the missing "To Amount" column header while in this file.
6. **Duplicate secondary nav to remove**: `(track)/layout.tsx` renders
   `TrackTabs` (Transactions/Accounts), which duplicates `SidebarNav`'s
   already-present Accounts/Transactions items one level up — confirmed
   via direct read this session. Plan: delete `TrackTabs`/`track-tabs.tsx`
   entirely; sidebar active-state already shows current location.
   `AccountTabs` (Transactions/History/Settings) is explicitly NOT a
   duplicate and stays.
7. **Account Detail Settings tab is too wide on desktop** — needs a
   `max-w-2xl` wrapper (full-width still on mobile).
8. **Pagination on the global `/transactions` page** — Account Detail's
   Transactions tab already has it (`src/lib/pagination.ts`, 20/50,
   default 20, already built and reusable); the global list currently
   doesn't.

Representative file list, decisions on the "Split Transaction" semantics
and filter serialization, and the full verification checklist are all in
the plan file — don't re-derive them, they're already resolved there.

## Environment / state notes

- **Still no git repo** — explicit prior instruction, still true, don't
  `git init` unless asked.
- Dev server: stopped at the end of this session (was running on
  `localhost:3000` during verification, killed before wrap-up).
- `recharts` was added as a real `package.json` dependency this session
  (not a scratchpad-only tool like Playwright/axe-core) — it's genuinely
  used by Account Detail's History tab charts.
- Verification tooling (Playwright, `@axe-core/playwright`) was installed
  into `/tmp/pw-scratch` (a scratchpad, not a project dependency) —
  reinstall there if re-verifying; same pattern as every prior session.
- Test/demo data from this session's own verification passes is left in
  the real local databases (`data/families/*.db`, `data/registry.db`) —
  harmless, same precedent as every prior session. One Family was
  genuinely deleted end-to-end during Family-deletion verification
  ("Mobile Test Family") — confirmed its `.db`/WAL/SHM files are actually
  gone from disk, not just hidden.
- `docs/design/design.md`, `docs/onboarding.md`, and the v9-delta contract
  docs remain the design/architecture authorities — nothing about them
  changed this session beyond the tag-shape doc updates already described
  above (`02-domain-model.md`, `06-architecture.md`, `07-decisions.md`
  ADR-026, `09-data-model.dbml`, `10-open-decisions.md`,
  `screen-contracts.md` — all updated to `string[]` tags; historical
  narrative docs like `v9-delta/delta-change-v9.md` and
  `ledger-transaction-list-change.md` deliberately left as-is).

## What to do next

Resume the saved plan at `~/.claude/plans/bright-questing-crab.md` — it's
already fully scoped and ready to execute (research done, decisions made,
file list identified). Otherwise: whatever the user asks for next: this
project's working agreement is to wait for direction, not assume the next
phase.
