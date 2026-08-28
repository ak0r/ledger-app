# Hand-off: 2026-08-26 session

Read `AGENTS.md` and `docs/` first (rule #1). Continues from
`docs/2026-08-22/handoff.md` (Instrument Model Step 1).

## What's done, verified, and shipped this session

The **Import Framework**, built across three sequential deltas archived
verbatim (with a short implementation-note addendum on the first) in
`docs/completed/`:

1. **`2026-08-25-Import-Framework-Phase-1.md`** — the base pipeline: Upload
   → Parse (adapter or generic-CSV fallback) → Normalise → Account
   Resolution → Preview → User Approval → Commit. Permanent `Import ID`
   provenance on every transaction created by an import. `Unknown`
   counter-account fallback when the destination can't be resolved.

2. **`2026-08-25-Import-Workflow-Multi-File.md`** — multi-file upload into
   one review workspace, fully editable transaction preview reusing the
   Transactions page's own interaction patterns (row edit, bulk edit,
   bulk tag), generalized account resolution (any existing account or a
   proposed new one, not just Unknown), no persisted staging — everything
   from Parse through Preview is transient, held only in the browser
   until Approve.

3. **`2026-08-26-Import-Account-Resolution.md`** — redesigned `/imports`
   landing page, no upfront account selection (the statement itself
   identifies the account), adapter registry keyed
   `institution.product.format` (e.g. `hdfc.account.xls`,
   `generic.any.csv` always last as universal fallback), a real HDFC
   Account XLS adapter, a new `AccountIdentifier` child entity for
   exact/possible-match/ambiguous account matching with user-approved
   identifier learning, enriched import history (resolved account,
   new-account count, inflow/outflow, status `successful`/`failed` only
   — never `committed`/`approved`, since nothing is written before the
   single atomic commit).

Followed by two UI-only refinement requests (no delta doc, no schema
change — see `docs/07-decisions.md` ADR-030/031/032 for the architecture
these implement):

4. **Wide workbench layout** — `/imports` review screen dropped the narrow
   dashboard content max-width in favour of a wide responsive container;
   desktop shows Uploaded Files + Identified Accounts as a two-column
   section above the transaction table; the table uses a flexible
   Description column with fixed-width Date/Account/Dr-Cr/Amount/
   Counterpart/Actions columns; mobile keeps the existing card pattern
   instead of squeezing the desktop table.

5. **Identified Accounts restructure** — corrected a real modelling bug:
   `Unknown (Expense)`/`Unknown (Income)` were being treated as a special
   temporary import bucket rather than what they actually are — proposed
   new accounts, exactly like a proposed `HDFC Bank ••••0077`. Unified
   both under one `ResolutionChoice` type and a `counterpartGroups` memo.
   Each card's `⋮` menu now supports Change/Edit, Map to existing account,
   and (for proposed accounts) editing name/classification/instrument
   type, or (for identifier-bearing accounts) viewing/editing detected
   identifiers. Picking a different account in the Change Account dialog
   immediately re-renders the transaction preview. Account rows are still
   only ever created on Approve — the dialog only changes the import's
   proposed resolution, keeping the whole import atomic (preview/edit
   transient, approve creates accounts + commits transactions in one
   transaction).

Also, per an explicit user privacy directive (now `AGENTS.md` rules
#23-25): all import parsing is local/offline-only, no uploaded statement
or parsed data is ever sent to an external service, and no real personal
or financial data may be committed, logged, or reproduced anywhere in the
repo. The adapter was developed against a real personal HDFC statement
during this session, but that file was never committed and does not
exist as a fixture; the shipped fixture
(`fixtures/imports/hdfc/account/sample.xls`) is fully synthetic (fake
account number, fabricated transactions).

Test suite: 272/272 passing as of the last full run this session
(`src/domain/accountIdentifier.test.ts`,
`src/server/import-adapters/{genericCsv,hdfcAccountXls}.test.ts`,
`src/server/use-cases/imports.test.ts`,
`src/server/actions/imports.test.ts`, plus all pre-existing suites).

## Known issue found and fixed mid-session

**Drizzle migration ordering via hand-edited `meta/_journal.json`.** During
the `imports` → `import_files` rename, `drizzle-kit generate` produced a
new migration whose auto-generated `when` timestamp was *earlier* than an
already-applied migration's timestamp (that earlier migration's `when` had
been hand-edited in a prior session). `drizzle-kit migrate` silently
treated the new migration as already-applied and skipped it — no error,
just a missing table at runtime. If you ever hand-edit a migration
timestamp in `meta/_journal.json` again: check that every later
migration's `when` is still strictly greater, or `drizzle-kit migrate`
will skip it without telling you.

## Documentation cleanup pass (this session, same day)

Separately from the Import Framework work, did a docs-only reconciliation
pass (no functional changes) — see the plan file this was executed
against for full rationale:
- Repo-wide `Family`/`Member` → `AppUser`/`Profile` terminology sweep
  across all numbered docs, `AGENTS.md`, `README.md`, `docs/design/design.md`.
- `AGENTS.md` rule #13 corrected (`Record<string,string>` → `string[]`,
  matching what actually shipped) and a new rule added summarizing the
  Import Framework architecture.
- `docs/09-data-model.dbml` fully rewritten to match the live Drizzle
  schema (previously missing `app_users`/`sessions`/`profiles`/
  `instruments`/`import_files`/`account_identifiers` entirely).
- `docs/07-decisions.md` gained ADR-029 (AppUser/Profile identity),
  ADR-030 (adapter registry keying), ADR-031 (`AccountIdentifier` entity
  + resolution algorithm), ADR-032 (atomic import commit).
- `docs/04-modules.md`, `docs/05-mvp-scope.md`, `docs/10-open-decisions.md`
  updated to reflect Imports as shipped (with the genuinely-still-open
  parts — email/SMS/PDF adapters, Rules plugin, Duplicate Detection
  plugin — called out explicitly as still open).
- Deleted fully-superseded docs: `docs/v9-delta/*` (Family-as-database-
  boundary — implemented once, then reversed), `docs/onboarding.md` and
  `docs/screen-contracts.md` (both describe the removed Family→Member
  flow with no clean replacement written), `docs/ledger-transaction-list-change.md`
  (fully superseded by the current implementation).
- Merged `docs/design/design-delta-1.md` (typography) into
  `docs/design/design.md` §3.4, then deleted the delta file.
- Archived the three Import Framework delta specs (which existed only as
  chat uploads, never committed) verbatim into `docs/completed/` — see
  above.
- Annotated `docs/pending/2026-08-21-Instrument-Model-Pricing-Foundations.md`
  with a one-line status note (Step 1 shipped, Steps 2-10 not started).

### Flagged, not fixed (explicitly out of scope for a docs-only pass)

- `CHANGELOG.md` is stale — stops before the tags migration, the
  AppUser/Profile migration, Instrument Step 1, and all Import Framework
  work. Needs an explicit decision: backfill it, or formally treat
  `docs/YYYY-MM-DD/handoff.md` as the changelog-of-record going forward.
- No onboarding contract exists for the current AppUser/Profile flow —
  the old one was deleted (architecturally wrong, not just stale-worded);
  a new one was not written since that's content creation, not
  reconciliation.
- `docs/2026-08-18/plan.md`'s "Delta 4: Expandable Split Transactions"
  completion status was not re-verified against the current component
  tree this pass.
- The Instrument/pricing scope line in `04-modules.md`/
  `10-open-decisions.md` takes the 2026-08-22 hand-off's word for "Step 1
  done, Step 2 next" rather than re-deriving from a fresh code audit.

## Suggested next steps

- Pick up `docs/pending/2026-08-21-Instrument-Model-Pricing-Foundations.md`
  Step 2 if investment/pricing work continues.
- Decide on the `CHANGELOG.md` question above before it drifts further.
- Additional import adapters (beyond HDFC Account XLS + generic CSV) or
  the Rules/Duplicate-Detection plugins remain fully open per
  `docs/10-open-decisions.md`.
