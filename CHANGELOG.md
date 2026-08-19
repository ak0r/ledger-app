# Changelog

All notable user-facing changes to Ledger are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries
are feature- and fix-level context summaries only — no file lists, no code
diffs, no commit-level detail. For the pre-implementation architecture
decision history, see `V5-CHANGELOG.md` through `V8-CHANGELOG.md` and
`docs/07-decisions.md`.

Versioning follows [Semantic Versioning](https://semver.org/) once the first
release is tagged. Until then, all work accumulates under `[Unreleased]`.

## [Unreleased]

### Changed — Product polish pass

- **Tags are now simple opaque strings, not key/value pairs** — a real
  data-model migration: `Record<string,string>` → `string[]` on both
  Account and Transaction tags, top to bottom (schema, use-cases, Zod
  schemas, filters, forms, list rendering, demo data, tests, and the
  data-shape-defining docs). No normalized Tag entity was introduced — tags
  stay inline per-record, exactly as before, just flat now (`["travel",
  "salary"]` instead of `{"Type":"travel"}`). A new `TagInput` component
  (chip add/remove, autocomplete suggesting tags already used elsewhere in
  the Family) replaces the old key/value `TagEditor`. Existing local data
  (this session's own test/demo Family databases — no real user data
  exists yet) was converted in place via a one-time script
  (`Object.values()` on each legacy tag object), not left in the old shape
  and not carried forward via a permanent compatibility shim.
- **Fixed: the entire app had been rendering in a fallback font, not Geist
  Sans.** `globals.css` mapped `--font-sans` to itself (a self-referencing,
  therefore invalid, CSS custom property) instead of to the `--font-geist-sans`
  variable Next's font loader actually produces — only Geist Mono was ever
  correctly wired. One-line fix, verified via computed `font-family` in a
  real browser (not just visual inspection).
- **Every dropdown is now a real, properly themed `Select`** (built on
  `@base-ui/react/select`, same pattern as the existing Dialog), replacing
  all 8 native `<select>` elements across the Account and Transaction
  forms and the Transactions filter — native selects can't be reliably
  styled for their open listbox, which was the root cause of the
  "dropdowns are unreadable when opened" complaint. The Family/Member
  switcher in the header was also upgraded from a hand-rolled panel to a
  real `@base-ui/react/menu`-backed component for correct keyboard
  navigation and focus management (same visual language, just correct
  semantics underneath).
- **Fixed: "New Transaction" silently bounced back to the Transactions
  list** instead of opening. Root cause: the destination route requires at
  least 2 Accounts to exist, but the button linking to it was never gated
  on that — with 0–1 Accounts it was clickable but immediately redirected
  back where the user started, indistinguishable from "nothing happens."
  The button is now gated the same way, with explicit guidance instead of
  a silent bounce, and the same gate applies to Account Detail's new "+ Add
  Transaction" action.
- **Add/Edit Account redesigned**: Classification is now a compact,
  keyboard-accessible card selector (icon + label) instead of a plain
  dropdown; "Instrument Type" is renamed "Account Type"; the Label field
  and the special Opening Balance field/mechanism are removed entirely —
  an opening balance is now just a normal Transaction against a Balancing
  Account, like any other entry, rather than a special creation-time
  input with its own auto-generated Transaction.
- **Account Detail redesigned** around three tabs — Transactions, History,
  Settings — replacing the old single flat page. Header is now Name →
  Balance → **+ Add Transaction** (pre-fills this Account). History is new:
  a monthly cashflow chart and a balance-trend chart (Recharts, driven by
  the app's existing `--chart-1..5` tokens, hover on desktop/tap on
  mobile) computed read-side from existing postings — no new persisted
  concept, and explicitly not a Transaction audit/edit trail. Settings
  hosts Tags, Currency (display-only, unchanged domain rule), the Account
  edit fields, and Archive — replacing the old header's Edit/Archive
  actions and the standalone `/accounts/[id]/edit` route, which is gone.
  Transactions gained a Filter drawer (search by description, extensible)
  and pagination (20/50 per page, default 20) — both new to Account Detail
  only; the Member-level Transactions page is unchanged.
- **Family deletion added** — real hard delete (registry row + the
  Family's physical `.db`/WAL/SHM files, connection evicted from cache
  first), with a confirmation naming the Family and everything it owns
  (Members/Accounts/Transactions/Postings). Supersedes the earlier "leave
  the action out" interim choice, which was always conditional on
  deletion not being ready to do properly — this satisfies that same
  contract's actual condition (no soft-delete, no partial lifecycle).
  Active-Family/Member cookies are cleared if they pointed at the deleted
  Family.
- Two small pre-existing color-contrast misses (`--muted-foreground` and
  `--success`, both marginally under WCAG AA at small text sizes) fixed
  with a barely-perceptible darkening, found via a real axe-core scan
  across every touched screen (zero violations after the fix).
- A real Server/Client Component boundary bug was found and fixed during
  verification: the Transactions page's filter dropdowns (a Server
  Component) briefly crashed with "Functions are not valid as a child of
  Client Components" after the Select migration — passing a label-lookup
  function as `children` across that boundary isn't serializable. Fixed
  by using `Select`'s `items` prop (plain serializable data) instead;
  every other `Select` usage lives inside already-client forms, where this
  doesn't apply.

### Added

- **Real onboarding flow** (`docs/onboarding.md`), replacing the bare
  Family/Member pickers with the documented decision tree: creating a
  Family now leads to a "How would you like to start?" screen offering
  **Start with Demo Data** or **Start from Scratch**, reachable only right
  after Family creation (an already-onboarded Family never sees it again).
  - **Native demo dataset**: choosing Demo Data atomically seeds two
    Members, an INR Currency each, ~25 realistic Accounts, and 1000+
    transactions spanning roughly a year — income, rent, a Home Loan EMI
    (a real Split transaction), credit-card spend and monthly payoff,
    inter-bank transfers, quarterly FD/EPF interest, tagged transactions,
    and activity across both Members. The dataset is generated fresh each
    time (a small seeded-PRNG generator, `src/server/demo/dataset.ts`) —
    not a literal import of the FinBodhi reference export that was supplied
    alongside the doc (`docs/demo-data/*.json`), which turned out to use a
    completely different, incompatible schema and to include stock/mutual-
    fund/metal instruments explicitly out of MVP scope
    (`docs/05-mvp-scope.md`, AGENTS.md rule #11) — that reference was used
    for naming/category inspiration only, per an explicit decision with the
    user. Every generated transaction is validated through the same domain
    balance/ownership check a real one goes through (rule #3 has no demo
    exception) before being written, atomically, in a single transaction —
    a failure leaves nothing partially created, so a failed attempt is
    simply retryable.
  - **Start from Scratch** now supports adding several Members before
    entering the app (previously the first Member created bounced straight
    into its own empty dashboard, with no way to add a second before that
    happened). Finishing this step marks one Member **Primary** — chosen
    automatically when there's only one, explicitly picked from a radio
    list when there are several.
  - **Primary Member** is a new, durable, server-persisted concept (a real
    `isPrimary` column on `members`, not the pre-existing "active Member"
    browser cookie, which stays convenience-only exactly as before). It's
    what lets returning to an already-set-up Family skip onboarding
    entirely and land straight on a sensible default Member, from the root
    redirect and from the Family switcher alike.
  - **Clean Up Content**: a new destructive action on the Family edit
    screen (`/families/[id]/edit`) that hard-deletes every Account,
    Transaction, and Currency in a Family while leaving the Family and its
    Members untouched — the documented way to discard a Demo Family's
    sample data (or start over) without losing the Family itself. Guarded
    by the same in-app confirmation dialog used elsewhere (no native
    browser `confirm()`).
  - No persisted onboarding-state machine was added despite
    `docs/onboarding.md` §12 naming one (`NEW`/`FAMILY_CREATED`/.../
    `READY`) — every state is fully derivable from existing data (does a
    Family exist? does any Member have `isPrimary`?), and a failed/
    interrupted demo copy is indistinguishable from "just created, not set
    up yet" thanks to the atomic insert above, so it's retryable with
    nothing extra to track.

### Changed

- **Per-Family database migrations now reach already-provisioned Families,
  not just brand-new ones.** Discovered while adding the `isPrimary`
  column above: the per-Family migration mechanism only ever ran at Family
  *creation*, with no path to apply a later schema change to a Family
  database that already existed — this is the first schema change since
  the Family-per-database architecture shipped, so the gap had never
  surfaced before. Replaced the ad hoc raw-SQL-exec loop with Drizzle's own
  migrator (already used for the registry database via the CLI, just not
  wired in-process here), plus a one-time journal backfill for databases
  provisioned before this fix existed (so it doesn't try to replay
  `CREATE TABLE` against tables that are already there). Verified against
  this session's own pre-existing test Family databases: they picked up
  the new column with no manual intervention and no data loss.
- Root redirect (`/`) and the Family switcher now land on a Family's
  Primary Member (falling back to the Member picker only if none is set
  yet) instead of only ever checking the Member cookie.
- Selective `font-mono` applied to the highest-value financial figures
  (Dashboard's Net Position and summary row, transaction amounts, Account
  balances) per `docs/design/design-delta-1.md` — deliberately not applied
  everywhere, per that doc's own "do not use monospace for all financial
  text" rule.

- Design review implementation pass, addressing the critical and
  high-priority findings from a FinBodhi-informed design review of the
  post-MVP UI refresh (`docs/design/design.md`, `docs/08-ui-principles.md`,
  `docs/screen-contracts.md`). No domain/schema changes — presentation
  layer only, per the review's own scoping.
  - **Flexoki token layer**: `globals.css` replaced the untouched
    zero-chroma shadcn default (every token was `oklch(x 0 0)`, no
    light/dark differentiation) with Flexoki's published palette — warm
    paper in light mode, warm near-black in dark mode — plus new semantic
    tokens (`success`/`warning`/`info`/`positive`/`negative` and
    per-classification `category-asset`/`category-liability`/
    `category-income`/`category-expense`/`category-balancing`) so no
    component hardcodes a color. `AccountIcon` and the Split-mode
    "Balanced" indicator now consume these tokens instead of hardcoded
    Tailwind palette classes.
  - **Responsive navigation**: the old always-on desktop icon rail (which
    was also the only nav shown on mobile, forcing a compressed-desktop
    layout onto phones) is replaced by a real collapsible `SidebarNav`
    (desktop, `md:` and up, grouped Home/Track sections, collapses to
    icon-only) and a dedicated `BottomNav` (mobile, persistent bottom bar).
    Both read from one shared `NAV_ITEMS` list. Scoped to Home/Accounts/
    Transactions only — no Insights/Settings entries, since neither has a
    screen behind it yet (consistent with the earlier "no Viz/Plan/
    Settings nav" decision from the original FinBodhi refresh).
  - **Mobile transaction list**: `TransactionTable` gained a compact card
    layout for narrow viewports (same `rows` data, no new query layer) —
    the desktop `<table>` is hidden below `md:`, replacing the old
    `overflow-x-auto` horizontal-scroll table that was the single most
    explicit anti-pattern the design docs call out.
  - **Header rebuild**: new `AppHeader` shows the "Ledger / v0.1.0" brand
    (previously only visible on the standalone `/families` picker, nowhere
    inside the working app) plus Family and Member switchers as dropdowns
    (desktop: two separate triggers; mobile: one compact combined trigger)
    so switching no longer requires leaving the current screen via a plain
    text link.
  - **Cancel action on every form**: `TransactionForm` and `AccountForm`
    both gained an explicit `Cancel` button next to Save/Create,
    navigating away without submitting (there was nothing to roll back
    server-side — no persisted draft). Previously the only way back was
    the browser's own Back button.
  - **`ConfirmDialog`**: new shared component built on the existing
    (previously unused) `ui/dialog.tsx` primitive, replacing the native
    `window.confirm()` on Transaction delete and adding a confirmation
    (there was none before) to Account archive — both destructive/
    state-changing actions now share one in-app dialog instead of one
    using a native browser prompt and the other having no guard at all.
  - **Dashboard hierarchy**: Net position now renders as a single
    full-width primary card above the Assets/Income/Expenses row, instead
    of all four metrics competing as identically-sized tiles.
  - **Enum label humanization**: every place that rendered a raw domain
    enum verbatim (`ASSET`, `CREDIT_CARD`, etc.) — the Account
    classification/instrument-type selects, the Transactions filter's
    Classification select, the Accounts list table, the Transaction form's
    account pickers, and the Dashboard's account-balances list — now shows
    a humanized label ("Asset", "Credit Card") via a new `humanizeEnum`
    presentation helper (`src/lib/utils.ts`). The enum values themselves
    are unchanged everywhere they're persisted/validated.
  - Right-aligned, tabular-numeral money columns (Accounts list Balance,
    Transaction table amounts) were already in place from the original
    refresh pass; confirmed still correct, not re-touched.
  - Verified end-to-end in a real headless browser across desktop
    (1280px) and mobile (390px) viewports, light and forced-dark theme:
    Currency/Account setup, Simple and Split transaction creation (live
    balance indicator), transaction editing (pre-fill + persist), the
    Delete and Archive confirm dialogs (both Cancel-preserves and
    Confirm-commits paths), the Cancel button on both forms (confirmed it
    discards, doesn't save), sidebar collapse/expand, and the mobile
    bottom nav + header switcher. Zero console/page errors throughout. The
    full unit/integration suite (103 tests) and `pnpm typecheck`/`pnpm
    lint` all stayed clean.
  - **Not done in this pass** (recorded, not blocking — medium/low per
    the review's own severity tiers): instrument-type options aren't
    filtered by classification (turns out ADR-015 explicitly decouples
    instrument type from accounting meaning, and no server-side validation
    ties specific instrument types to specific classifications today, so
    "guide toward valid combos" has no canonical mapping to encode without
    a separate domain decision); the Transactions filter panel is still
    always-open on mobile rather than progressively disclosed/collapsible.
  - **Found, not fixed** (out of scope for a presentation-layer pass —
    would be a use-case/domain-layer behavior change): archived Accounts
    remain fully selectable in new/edited Transactions — `listAccounts`
    doesn't filter `isArchived`, and there's no unarchive action anywhere
    in the codebase (only `archiveAccountCore` setting the flag `true` is
    ever called).

### Added

- **Family is now a real, isolated-dataset architectural boundary**
  (`docs/v9-delta/family-concept-contract.md`), superseding the earlier
  "cosmetic only" decision from the FinBodhi UI refresh. Each Family gets
  its own physically separate SQLite database file
  (`data/families/<familyId>.db`) — there is no `family_id` column
  anywhere; isolation is by file, not by foreign key. A small separate
  registry database (`data/registry.db`, its own Drizzle schema/
  migrations) tracks which Families exist; Family selection happens
  above the financial database, exactly as the contract specifies.
  `src/server/db/family-client.ts` resolves a `familyId` to its `Db`
  connection (cached per id) and fails safely — `getFamilyDb` throws
  rather than silently opening/creating an empty dataset for an
  unprovisioned Family id; only `provisionFamilyDb`, called once at
  Family creation, is allowed to create one. New routing:
  `/families` (list/create, application-level, above any Family) and
  `/families/[familyId]/edit` (rename only — never changes dataset
  identity, and there is deliberately no delete action per contract §15,
  "leave the action out rather than invent a partial lifecycle"); the
  entire existing Member-scoped app moved from `/m/[memberId]/...` and
  `/members` to `/f/[familyId]/m/[memberId]/...` and
  `/f/[familyId]/members`. The Member-scoped shell header now shows both
  "Switch Member" and "Switch Family". `src/app/page.tsx`'s root redirect
  became three-tier (Family cookie → Member cookie → picker) instead of
  two-tier. Because every use-case/repository function already took `db`
  as an explicit parameter (the DI pattern from Phase 4), the domain and
  use-case layers needed **zero** changes — only the connection-
  resolution layer and the explicit `familyId` threading through routes/
  actions/forms (mirroring how `memberId` was already threaded) were new.
  Verified end-to-end with a real headless-browser pass: two Families
  each with their own Member/Account/Transaction, confirmed zero data
  bleed-through in any view, confirmed a bogus `familyId` fails safely
  (redirects to `/families`, never crashes or silently creates a
  dataset), confirmed renaming a Family leaves its data untouched, and
  confirmed on disk that the two Families really do have separate
  `.db`/WAL files. The rest of `docs/v9-delta/delta-change-v9.md` (Member-
  ownership invariant, generic `Postings[]` persistence, posting
  invariants, inline tags, hard-delete atomicity, INR-only/same-currency)
  was already satisfied by the existing implementation — confirmed by
  audit, not new work. Its forward-looking guardrails for a future
  Investments module (external instrument lookup, prices as external
  data) remain out of scope, since no such module exists yet
  (rule #18).
- Project scaffolding: the application now boots as a working (empty) local
  web app, with the development, type-checking, testing, linting, and
  database-migration tooling all wired end to end. Nothing user-facing yet —
  this is the foundation Phase 1 of the MVP implementation plan called for.
  `pnpm lint` and `pnpm build` are now confirmed clean, closing out Phase 1.
- Full database schema (`members`, `currencies`, `accounts`, `transactions`,
  `postings`) translated field-for-field from `docs/09-data-model.dbml`,
  replacing the Phase 1 placeholder single-table schema. Migration generated
  and verified against a real SQLite file: cross-table inserts, foreign-key
  rejection, and cascade delete of postings on transaction delete all behave
  as the domain docs require. No user-facing surface yet — Phase 2 of the
  MVP implementation plan.
- Domain core (`src/domain/`): pure, framework-free posting/transaction
  validation covering the posting invariant (non-negative integer amounts,
  exactly one side positive), the transaction invariant (>= 2 postings,
  balanced), the ownership invariant (posting account's Member matches the
  transaction's Member), and the MVP-only INR currency invariant. 22 unit
  tests cover the full docs/06-architecture.md "Testing" checklist —
  balanced/unbalanced, expense, income, transfer, credit-card purchase and
  payment, multi-posting split, opening balance, edit-preserves-balance, and
  delete-does-not-corrupt-balance. Still no persistence or UI wired to it —
  Phase 3 of the MVP implementation plan.
- Application layer (`src/server/repositories/`, `src/server/use-cases/`):
  Member-scoped repositories wrapping Drizzle (every query takes an
  explicit `memberId`, rule #6), and use-cases — `createMember`,
  `createCurrency` (a separate step from Member creation, by design),
  `createAccount`, `archiveAccount`, `createTransaction`, `editTransaction`
  (full replace, confirmed), `deleteTransaction` (hard delete, cascades
  postings). Every mutation revalidates through the Phase 3 domain layer
  before writing, and transaction writes are wrapped atomically. 16
  integration tests against real in-memory SQLite cover every mutation,
  atomicity on validation failure, and rejection of cross-Member
  ownership-violating writes. Still no UI — Phase 4 of the MVP
  implementation plan.
- Server Action API surface (`src/server/actions/`): `createMemberAction`,
  `createCurrencyAction`, `createAccountAction`, `archiveAccountAction`,
  `createTransactionAction`, `editTransactionAction`,
  `deleteTransactionAction`. Zod schemas validate input shape and the
  DB-independent invariants (posting shape, >= 2 postings, balance) for
  fast client feedback; the Phase 3/4 domain and use-case layers remain the
  real enforcement point for ownership and currency-support checks, which
  need Account rows from the DB. Active-Member context resolved as
  URL-scoped (`/m/[memberId]/...` in Phase 6) with a convenience-only
  cookie — Server Actions take `memberId` as an explicit argument, never
  hidden session state. 20 new tests, including a full
  Member → Currency → Account → Transaction chain through the action layer
  alone. Still no UI — Phase 5 of the MVP implementation plan.
- Core UI shell (Phase 6) — Ledger has a real UI for the first time:
  - `/` bounces to `/m/[memberId]` (via a convenience-only cookie) or to
    `/members` when there's nothing to bounce to.
  - `/members`: onboarding for the first Member, a picker for the rest, and
    a zero-JS "Switch" flow back into it from anywhere.
  - `/m/[memberId]/...`: every route re-derives and re-validates the active
    Member from the URL (never from hidden session state), with a shared
    nav shell (Dashboard / Accounts) and a dashboard placeholder — real
    balances/reports are Phase 9.
  - Accounts: list, create, edit, and archive, all through the UI. Creating
    the first Account is gated behind a one-button "Set up ₹ INR" step
    (Currency creation stays separate from Member creation, by design) —
    MVP is INR-only, so there's nothing to choose.
  - `pnpm db:migrate` (new script, wrapping `drizzle-kit migrate`) is now
    the documented way to apply migrations to the real local `ledger.db` —
    previously only ever exercised against throwaway/in-memory databases in
    tests, so the running app's actual database file had never been
    migrated until this phase surfaced it.
  - Verified end-to-end in a real headless browser (Playwright, not just
    lint/build/tests): Member creation, Account creation/edit/archive, and
    Member switching all confirmed working with zero console errors,
    including the two mechanisms most likely to silently break — a Server
    Action called directly from a React Hook Form submit handler that
    calls `redirect()` on success, and zero-JS `<form action={...bind()}>`
    buttons for one-click actions (archive, activate Member, set up
    Currency).
- Transaction entry: Simple mode + list (Phase 7):
  - `/m/[memberId]/transactions/new`: Date / Description / From / Amount /
    To (docs/08-ui-principles.md Simple mode) — no debit/credit language
    anywhere. From is credited, To is debited; the same shape covers
    expense, income, and transfer alike (the account classifications
    involved are what make it read as one or the other), so there's no
    separate transaction "type" to pick.
  - `/m/[memberId]/transactions`: list via TanStack Table — the `/legacy`
    compat subpath specifically, since v9's default `useTable` turned out
    to be a new atom/store-based API this list's static-table needs don't
    call for yet (that's Phase 9's sorting/filtering territory).
  - New domain helpers `toMinorUnits`/`fromMinorUnits` (`src/domain/money.ts`)
    convert between a typed decimal amount and integer minor units using
    the Currency's own scale (ADR-022) — no hardcoded assumption baked into
    the UI layer.
  - Verified end-to-end in a real headless browser: logged an expense, an
    income, and a transfer through Simple mode against a fresh Member, all
    three appearing correctly in the list with the right From/To/Amount;
    also confirmed the form rejects picking the same Account for both From
    and To. Zero console errors.
- Split mode + tags (Phase 8):
  - Split mode extends Simple mode's form in place — "+ Split" turns the
    single "To" account into a dynamic list of destination lines (add/
    remove), each with its own amount, with a live running Total compared
    against the top-level Amount and a ✓/✗ Balanced indicator that
    re-validates on every keystroke. Simple mode is really Split mode with
    exactly one destination line, so both share one schema and one submit
    path (ADR-027) — the live balance check compares integer minor units,
    not raw decimals, to avoid floating-point false negatives.
  - Transaction editing now has a real UI (`/m/[memberId]/transactions/
    [transactionId]/edit`) — this didn't exist after Phase 7 (create + list
    only); Phase 8's exit criteria specifically needs N-posting Split-mode
    transactions to be editable, so the edit page arrived alongside Split
    mode rather than waiting for Phase 10's full edit/delete hardening.
    Pre-fills correctly into Split mode when a Transaction has more than
    two postings.
  - Tag chips on Accounts and Transactions (rule #13/#14: inline
    `Record<string,string>`, no global Tag entity) — a shared `TagEditor`
    (add/remove) wired into both entities' create/edit forms, and a
    read-only `TagChips` display on both list pages. Account editing didn't
    support tags at all before this (`editAccountSchema` was missing the
    field even though `createAccountSchema` already had it since Phase 5);
    Transaction tags were already fully wired server-side since Phase 5 and
    only needed the UI.
  - Verified end-to-end in a real headless browser: a Split-mode
    transaction (₹5,000 from HDFC Credit Card split ₹2,000/₹3,000 across
    Food/Receivable, matching the docs/02-domain-model.md split example)
    created with a tag, the live indicator flipping between ✓ Balanced and
    ✗ Not balanced as amounts changed, an unbalanced split correctly
    rejected client-side, and the resulting transaction re-opened for edit
    with both destination lines and the tag pre-filled, edited, and saved
    with the new total reflected in the list. Zero console errors.
- Filters + basic reports (Phase 9):
  - Transaction list filters exactly as scoped in docs/08-ui-principles.md:
    date range, Account, classification, tag key/value — no query language,
    no regex, each field optional and combined with plain AND. Built as a
    native `<form method="GET">` reading `searchParams` server-side, so
    filtering needs no client JS and filtered views are shareable/
    bookmarkable URLs. No separate "Member" filter — `/m/[memberId]/...`
    already scopes everything to one Member (resolved 2026-08-15, HANDOFF.md
    open decisions #3), so a Member filter within that view would be
    structurally redundant. "Tag-filtered views" (docs/04-modules.md
    "Reports") is satisfied by the tag key/value filter rather than a
    separate reports page.
  - New domain function `accountBalance` (`src/domain/balance.ts`) computes
    an Account's balance from its raw posting totals against its
    classification's normal balance side (ASSET/EXPENSE debit-normal,
    LIABILITY/INCOME/BALANCING credit-normal) — a positive, intuitive
    number regardless of classification (e.g. a credit card's balance owed).
  - Dashboard now shows real numbers instead of the Phase 6 placeholder:
    net position, total assets, income, expenses, a full account-balances
    list, and the 5 most recent transactions. Accounts list gained a
    Balance column. All computed read-side from ledger data only
    (docs/04-modules.md) — nothing new persisted.
  - Scoped out: "transaction trends" (docs/11-implementation-plan.md's
    descriptive bullet, not its exit criteria) — no charting library is
    part of the approved stack (docs/06-architecture.md), and Phase 9's
    actual exit criteria ("dashboard shows real numbers; filters work
    across all listed fields") doesn't need one.
  - Verified end-to-end in a real headless browser against a fresh Member
    with 4 Accounts and 3 Transactions: dashboard numbers matched hand
    computation exactly (net position, assets, income, expenses, per-account
    balances), Accounts list balance column correct, and all five filters
    (date range, Account, classification, tag key, tag key+value) plus a
    combined AND case each correctly included/excluded the right
    Transactions, with Clear resetting to the unfiltered list. Zero console
    errors.
- Edit/delete hardening + opening balances (Phase 10):
  - Transaction delete flow — a "Delete" button next to each row on the
    Transaction list, guarded by a native `confirm()` prompt. Resolved
    2026-08-15 (HANDOFF.md open decisions #4): no backup/undo mitigation —
    once confirmed, the hard delete is immediate and permanent, exactly
    matching ADR-019/rule #9 as already accepted. `deleteTransactionAction`
    itself already existed since Phase 5 and was already fully tested; this
    phase only wired it into the UI.
  - Edit flow hardening: no new work needed — Phase 6/8 already built
    pre-filled forms, atomic full-replace, and full domain re-validation
    for both Account and Transaction editing, already covered by
    domain-level tests (Phase 4) and UI-level browser verification
    (Phase 6/8). Re-confirmed rather than rebuilt.
  - Opening balances (V8-CHANGELOG #9-10, implementation-only per the plan
    — the UX itself was already decided): an optional "Opening balance"
    field on Account creation. When set, `createAccount` atomically also
    creates a normal balanced Transaction against a Balancing Account,
    auto-provisioning that Account the first time a Member needs one and
    reusing it afterward — posting to the new Account's normal-balance side
    (new domain export `isDebitNormal`) and the opposite side to Balancing,
    so a Balancing Account's own balance rises or falls exactly as real
    double-entry requires (e.g. recording a pre-existing liability's
    opening balance *reduces* net Opening Balance, same as it reduces net
    worth). Not available on Account editing — creation-time only.
  - Two real bugs caught by browser verification (not lint/typecheck/unit
    tests) and fixed: (1) leaving the new optional Opening Balance field
    blank produced a Zod "expected number, received NaN" crash — React
    Hook Form's `valueAsNumber` turns an empty optional input into `NaN`,
    not `undefined`, so the schema needed a `z.preprocess` step to
    normalize that before validation; fixing it meant dropping the
    explicit `useForm<T>()` generic in favor of letting it infer from the
    resolver, the same `z.coerce`-shaped typing conflict hit and fixed the
    same way in Phase 7's `TransactionForm`. (2) None in the actual delete
    path — both apparent delete failures during manual verification turned
    out to be test-script row-targeting mistakes (clicking the wrong
    row's Delete button in a list with more rows than expected), confirmed
    by re-checking against the actual screenshots.
  - Verified end-to-end in a real headless browser: an ASSET opening
    balance and a LIABILITY opening balance both created correctly (the
    second reusing the same auto-created Balancing Account rather than
    duplicating it), the dashboard's net Opening Balance reflecting both
    entries correctly, an Account created with no opening balance staying
    at zero with no stray Transaction, and a Transaction deleted through
    the confirm-guarded Delete button — confirmed gone after a full page
    reload (a real hard delete, not just client-side state). Zero console
    errors.
- Polish, packaging, MVP acceptance (Phase 11) — **MVP complete**, all 11
  phases of `docs/11-implementation-plan.md` done:
  - Error/empty/loading states: `error.tsx` + `global-error.tsx` (Next
    16.3 renamed the recovery callback from `reset` to `retry` — the
    bundled docs caught this before it became a bug) and a branded
    `not-found.tsx` at the root; `loading.tsx` skeletons on `/members` and
    every `/m/[memberId]` data-fetching segment. Empty states themselves
    (no Members, no Currency, no Accounts, no Transactions, no filter
    matches) were already in place from Phases 6–9.
  - Local deployment packaging: added `pnpm db:migrate` documentation and
    an actual "Running locally" section to `README.md` (it previously had
    none — domain summary only, no setup instructions). Verified a real
    `pnpm build && pnpm start` production boot end-to-end for the first
    time this project — every prior verification pass had only ever used
    `pnpm dev`.
  - Accessibility pass: scanned 10 pages/states with `@axe-core/playwright`
    (dev-only, not a project dependency) and fixed every real finding: (1)
    `CardTitle` rendered as a `<div>`, so six standalone pages (New/Edit
    Account, New/Edit Transaction, both currency-gate states) had *no*
    `<h1>` at all — `CardTitle` gained an `as` prop; (2) empty
    icon-only table header cells on the Accounts and Transactions lists
    lacked accessible text — added `sr-only` "Actions" labels; (3) the
    "✓ Balanced" indicator's green text failed WCAG AA contrast
    (`green-600` → `green-700`); (4) Split mode's per-line account
    `<select>` and amount `<input>` had no accessible name at all
    (critical severity) — added `aria-label`s. Zero violations after
    fixes, re-verified with a full re-scan.
  - Mobile QA at 375px width (iPhone SE) across every route: no horizontal
    page overflow anywhere (tables scroll within their own container by
    design). Found and fixed one real cramped-layout issue: Split mode's
    per-line row squeezed its account `<select>` down to a few visible
    characters — now stacks vertically below `sm:`.
  - One more real bug caught by manual browser testing, unrelated to
    accessibility or mobile: clicking "+ Split" adds an empty second
    destination line; if a user filled only the first line and hit Save,
    the form silently failed to submit with **no visible error** — the
    only error rendered was a root-level `toLines` message that Zod's
    schema-level `refine` doesn't actually populate for a specific empty
    array item. Fixed by rendering each line's own field-level error
    (`errors.toLines[index]?.accountId`/`.amount`) next to that line.
  - MVP scope audit: walked every bullet in `docs/05-mvp-scope.md`
    "Included" against the actual codebase (every use-case, every route,
    every action) and confirmed each is implemented and tested; grepped
    the whole `src/` tree for anything from "Explicitly excluded" (Spaces,
    expense sharing, imports, multi-currency/FX, investments, budgets,
    transaction history, AI, authentication, cloud sync) — zero matches.
    Schema has exactly the five tables in `docs/09-data-model.dbml`, no
    more; `CLASSIFICATIONS`/`INSTRUMENT_TYPES` match ADR-024's frozen list
    exactly.
- UI refresh, inspired by FinBodhi reference screenshots and two
  supplementary docs (`docs/screen-contracts.md`,
  `docs/ledger-transaction-list-change.md` — additive, v9 docs unchanged).
  No domain/schema changes; this is presentation-layer only. Scope was
  explicitly narrowed against both new docs before implementation (Plan
  Mode, user-approved): no new "Family" entity (cosmetic-only, nothing
  added since nothing real backs it), no Viz/Plan/Settings nav (no
  charting library in the approved stack), no inline cell-editing (the
  existing dedicated Edit page already satisfies "rows are not
  click-to-edit... explicit Edit action").
  - Left icon-rail nav shell (`NavRail`) — Home and Track, the only two
    real areas per `screen-contracts.md` §2. Accounts and Transactions
    move under a `(track)` route group (Next.js route groups are
    invisible in the URL) with a shared Transactions/Accounts sub-nav —
    all existing URLs unchanged.
  - **New Account detail page** (`/m/[memberId]/accounts/[accountId]`) —
    this was the core ask in `ledger-transaction-list-change.md`: one
    reusable `TransactionTable`, not a separate `AccountTransactionTable`.
    Account scope needed zero new query-layer code — `filterTransactions`
    already accepted an `accountId` filter since Phase 9. New shared
    `buildTransactionTableRows` helper (`src/lib/transaction-rows.ts`)
    means the Member-scoped Transactions page and the new Account detail
    page share one mapping function instead of two copies.
  - Transaction table restructured to match the reference's row model
    exactly: multiple destinations stack inside one logical row (e.g.
    "Food ₹2,500 / Receivable ₹2,500" under one Split transaction), never
    flattened into separate table rows, with a From Amount / → / To
    column layout.
  - Light/Dark/System theming via `next-themes` — the `.dark` class and
    all the semantic tokens it needs already existed in `globals.css`
    since the Phase 1 shadcn init, they were just never toggled; this
    wires the actual mechanism (default: System) plus a cycling toggle
    control. Exact Flexoki hue tuning is intentionally deferred as a
    separate, lower-risk values-only follow-up. Also fixed the leftover
    literal "Create Next App" page title/description while touching the
    root layout for the `ThemeProvider`.
  - One icon per Account classification (`AccountIcon`), shown in the
    Accounts list, the transaction table's account cells, and the Account
    detail header.
  - Caught and fixed 3 real bugs via testing, none of them caught by
    lint/typecheck/unit tests: (1) a real `react-hooks/set-state-in-effect`
    lint **error** (not a warning) from the classic `useState`+`useEffect`
    hydration-safe "mounted" pattern — replaced with the
    `useSyncExternalStore`-based version React actually recommends now;
    (2) two real accessibility regressions introduced by the table
    restructure (an empty connector-column header, and two now-ambiguous
    unlabeled `<nav>` landmarks) caught by an axe-core re-scan; (3) the
    "✓ Balanced" green indicator text passed WCAG AA contrast in light
    mode (fixed earlier, in Phase 11) but failed it in dark mode — needed
    an explicit `dark:` variant, not just a single fixed shade.
  - Verified end-to-end in a real headless browser across three separate
    verification passes (nav/routing, Account-detail scoping, theming/
    icons) plus a full a11y re-scan of every page in both light and dark
    mode (zero violations) and a second `pnpm build && pnpm start`
    production-mode pass (first done in Phase 11, repeated here since this
    change touched routing and the root layout again) — zero console
    errors throughout. Two apparent test failures during verification
    turned out to be test-script bugs, not app bugs, and were confirmed
    as such before being dismissed: a Suspense-loading-fallback race from
    navigating too fast, and Playwright's synthetic `click({force:true})`
    misbehaving specifically where Next's dev-only overlay badge overlaps
    the same corner as the new theme toggle (confirmed via a raw DOM
    `.click()`, which worked correctly every time).
