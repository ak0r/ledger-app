# Hand-off: 2026-08-22 session

Read `AGENTS.md` and `docs/` first (rule #1). Session convention: hand-offs
live under `docs/YYYY-MM-DD/handoff.md` (see `docs/2026-08-18/handoff.md`).
No `docs/2026-08-19`/`2026-08-20`/`2026-08-21` hand-offs exist — that work
(Family/Member → AppUser/Profile migration, design-taste polish pass)
happened but wasn't written up in this convention; summarized below
instead since it's directly relevant context for what's in flight now.

## What's done, verified, and shipped this session

1. **Finished the Family/Member → AppUser/Profile migration** (started a
   prior session, interrupted mid-flight). Server layer was already
   correct; this session ported the entire UI layer: routes
   `/f/[familyId]/m/[memberId]/...` → `/p/[profileId]/...`, `/families` →
   `/profiles`, every component collapsed from two-arg
   `(familyId, memberId)` scoping to single `profileId`. Verified:
   `tsc`/`eslint`/`vitest` (225/225)/`next build` all clean. One mistake
   caught mid-session: an agent deleted 11 docs files outside its actual
   scope — restored via `git checkout --`.

2. **Design-taste audit + 6-item polish pass** (Taste Skill v2, scoped
   explicitly as "preserve" not "redesign" — see the audit conversation
   for the full A-L structured report). Implemented, all verified live
   against real demo data + screenshots:
   - Native `<input type="date">` in New Transaction → custom
     `src/components/ui/date-picker.tsx` + `ui/popover.tsx` (new,
     dependency-free — no Calendar/react-day-picker existed in the repo).
     UTC-anchored calendar math (mirrors `formatDate`'s own timezone-safety
     discipline), displays "15 Aug 2026" matching the rest of the app.
   - Sidebar's redundant "Home" section-label-above-"Home"-item —
     `sidebar-nav.tsx`'s `renderGroup` now skips the label when null.
   - Accounts page's count line moved from an inline `ml-auto` span to its
     own line, matching Transactions' existing placement exactly.
   - Menu item spacing — fixed at the shared `ui/menu.tsx` primitive
     (`MenuContent`/`MenuGroup` now `flex flex-col gap-0.5`), so it's
     consistent everywhere, not just the profile switcher.
   - `/profiles` roster → styled as a modal (`Dialog`/`DialogContent`,
     built-in corner close button, `router.back()` on close). **Known
     limitation**: it's a styled page, not a true Next.js intercepting
     route, so there's no dashboard visibly blurred behind it. If that's
     wanted later, needs real parallel/intercepting routes — bigger scope,
     flagged but not done.
   - Investigated but **no code change**: Merge Transaction eligibility
     (already correctly gated via `checkMergeEligibility`, the flagged row
     had genuine candidates — not a bug), classification-colour-on-text
     (kept neutral per explicit instruction, added locking doc comments),
     hydration `caret-color` warning (zero references anywhere in app code
     or Base UI's Input primitive — browser-environment artifact, not
     fixable here, documented and deferred).

3. **Fixed a real mistake mid-session**: ran `rm -rf data` at repo root by
   accident (meant `/tmp/pw-scratch`) while setting up Playwright for
   screenshots. No real data lost (confirmed with the user — disposable
   demo/dev DB). Added a lasting guardrail per the user's request:
   `.claude/settings.local.json` now has `"ask": ["Bash(rm -rf *)"]` — any
   `rm -rf` always requires explicit approval going forward, regardless of
   auto-allow mode.

4. **Installed the `ponytail` skill and plugin** (both `dietrichgebert/
   ponytail`, user-scope) — genuinely separate systems: the skill lives at
   `~/.agents/skills/ponytail` (symlinked to `~/.claude/skills/ponytail`,
   via `npx skills add`), the plugin is a full marketplace install (`claude
   plugin marketplace add` + `claude plugin install ponytail@ponytail`,
   tracked in `settings.json`'s `enabledPlugins`). Not yet checked whether
   the plugin also ships its own internal `ponytail` skill (possible
   duplicate) — flagged, not resolved.

5. **New architecture delta approved and Step 1 implemented**: "Instrument
   Model & Reference Pricing Foundations" (uploaded delta doc, dated
   2026-08-21, status "Ready for implementation"). Full plan at
   `/home/amitkul/.claude/plans/moonlit-riding-newt.md` — **read that file
   in full before continuing**, it's the authoritative spec for this work
   (locked decisions, exact file list per step, judgment calls already
   made and justified, don't re-derive). Scope is delta §17 steps 1-6 only
   (Instrument entity → identifiers → Account↔Instrument link → quantity →
   local catalogue → search UI) — steps 7-10 (live pricing-provider
   integration) are explicitly a separate future delta.

   **Step 1 (Instrument entity) shipped and verified**: `src/domain/
   instrument.ts` (new — `INSTRUMENT_BACKED_TYPES`/`isInstrumentBackedType`,
   a `satisfies`-checked subset of the frozen `INSTRUMENT_TYPES`, that
   array itself untouched per AGENTS.md rule #11), `instruments` table in
   `src/server/db/schema.ts` (explicitly NOT Profile-scoped — a deliberate
   documented exception to rule #6, since an Instrument is shared external
   reference data), `repositories/instruments.ts` + `use-cases/
   instruments.ts` (new, mirror the Currencies 4-layer template exactly).
   Migration `0001_panoramic_madrox.sql` generated, hand-reviewed, and
   applied. 6 new tests, 231/231 total pass, `tsc`/`eslint`/`next build`
   clean.

## What's next

**Step 2 — Instrument identifiers**, per the plan file: `instrumentIdentifiers`
table (provider + code, unique pair, FK cascade to `instruments`), extend
the same repository/use-case files, new `DuplicateInstrumentIdentifierError`
(add to `use-cases/errors.ts` **and** `actions/result.ts`'s `fromThrown`
allow-list — easy to forget the second half), standalone migration, tests.

Then steps 3-6 in order (see the plan file's "Suggested execution order").
**Phase-gate discipline is active for this delta** — the user explicitly
confirmed a small-steps, check-in-per-boundary approach (matches the
standing "wait for manual user check after every implementation phase"
preference); don't auto-chain through all remaining steps in one pass.
Natural check-in boundaries per the plan: after step 3 (plumbing complete,
no UI yet), after step 4 (quantity fully works headless), after step 6
(full UI flow works end to end).

Two judgment calls in the plan flagged as worth confirming during
implementation, not blocking: (1) whether `PostingInput`/`AccountRef`
should gain `instrumentType` context directly vs. keeping the
"instrument-backed → quantity required" check one layer up in
`use-cases/transactions.ts` (plan recommends the latter, smaller diff);
(2) whether to build a bespoke `InstrumentSearchSelect` combobox in step 6
or check again for an existing UI-kit Combobox/Command primitive by then
(none existed as of this plan).

## Environment / state notes

- Dev server running on `localhost:3000` (PID checked via `ps aux | grep
  next-server` before starting another — this session hit "another next
  dev server is already running" more than once).
- Demo/dev DB at `data/ledger.db` is disposable test data, not precious —
  confirmed by the user after the `rm -rf` incident. Currently has 10
  Profiles (many from this session's repeated Playwright test registrations)
  and one Primary AppUser: `audit-1787243464385@example.com` /
  `password1234` (only known Primary in the current DB — needed to see the
  multi-Profile switcher/`/profiles` roster, since every other test user
  registered this session is a Normal AppUser with no switcher).
- Playwright scratch install lives in `/tmp/pw-scratch` (not committed,
  disposable) — reinstall there if missing for future visual verification.
- `rm -rf` now always prompts for approval (see item 3 above) — don't
  expect it to run silently even under auto/bypass modes.
- Nothing has been committed this session. `git status` currently shows
  ~160 changed lines across the Profile migration + design-polish +
  Instrument-delta-Step-1 work, all verified green but unreviewed/uncommitted.
