# Architecture Decision Log

## ADR-001 — Double-entry

Accepted. Double-entry is the accounting spine.

## ADR-002 — Transaction contains postings

Accepted. Use `Transaction -> Postings[]`.

## ADR-003 — Expense categories are Expense Accounts

Accepted. No separate accounting Category entity.

## ADR-004 — Rename Equity

Accepted. Use `BALANCING` instead of user-facing `EQUITY`.

## ADR-005 — Currency belongs to accounts

Accepted. Currencies are Profile-specific. Default INR.

## ADR-006 — Members do not require registration

Accepted. Superseded in vocabulary and in the registration premise by
ADR-029: a Profile is a financial identity independent of authentication,
but real AppUser authentication now exists — a Profile is typically linked
to exactly one authenticated AppUser (it can still exist unlinked).

## ADR-007 — Spaces are a module

Accepted. Not MVP core.

## ADR-008 — Expense sharing is a module

Accepted. Separate from accounting split.

## ADR-009 — Imports are a module

Accepted. Raw external data becomes candidate/postable transactions.

## ADR-010 — History is deferred

Accepted. Editing/deletion allowed in MVP; history UI later.

## ADR-011 — No merchant entity in MVP

Accepted. Use description/payee text.

## ADR-012 — SQLite

Accepted. Local-first SQLite. No Supabase/Postgres dependency for MVP.

## ADR-013 — AI is not core

Accepted. Future module consuming ledger/query data.

## ADR-014 — Tags are views

Accepted. Tags filter transactions/accounts without changing accounting classification. Account Tags and Transaction Tags are separate.

## ADR-015 — Account classification vs instrument type

Accepted.

`classification` determines accounting meaning. `instrument_type` describes the nature of the account/instrument.

Examples:

```text
ASSET + BANK
ASSET + STOCK
ASSET + METAL
LIABILITY + LOAN
EXPENSE + EXPENSE
```

Do not use instrument type to determine accounting treatment.

## ADR-016 — Instrument identifiers are optional

Accepted.

`instrument_id` and `instrument_label` are optional Account fields.

Examples:

- stock: ISIN
- metal: commodity/security identifier
- bank: institution/instrument identifier
- loan: may have no instrument identifier

Investment-specific use remains deferred.

## ADR-017 — Database naming convention

Accepted.

```text
Database: snake_case
TypeScript: camelCase
React components/types: PascalCase
Enums/constants: UPPER_SNAKE_CASE
```

Do not force one naming convention across all layers.

## ADR-018 — Explicit transaction ownership

Accepted. Superseded in vocabulary by ADR-029 (`member_id` → `profile_id`),
invariant unchanged.

Transactions contain `profile_id`. Every Posting Account must belong to that same Profile.

## ADR-019 — Hard delete

Accepted. MVP permanently deletes a transaction and its dependent records atomically. No soft-delete field is required.

## ADR-020 — INR-only MVP

Accepted, then superseded (2026-09-03, Settings/Backup/Data Management
delta, AGENTS.md rule #7): a Currency Catalogue replaces the INR-only
freeze — a Profile has a Primary Currency, an Account has its own
independently changeable Currency. No FX or currency conversion still
holds, except the one Currency Conversion 2-posting shape (ADR-038).

## ADR-021 — Account owns currency

Accepted. Each Account references exactly one Currency. Posting currency is derived from Account.

## ADR-022 — Currency owns scale

Accepted. Monetary values use integer minor units. Do not use floating-point values for money.

## ADR-023 — No persisted transaction draft

Accepted. Drafts exist only in transient UI/application state. A persisted transaction exists only after validation and successful atomic posting.

## ADR-024 — MVP instrument taxonomy

Accepted.

MVP instrument types:

```text
BANK
CASH
CREDIT_CARD
LOAN
EXPENSE
INCOME
BALANCING
```

STOCK, METAL, MUTUAL_FUND, ETF and similar types belong to future investment modules.

## ADR-025 — Multiple local Members

Accepted. Superseded by ADR-029: a Hosted Instance may contain multiple
Profiles, but "no authentication" is no longer true — real AppUser
login/session exists. Further superseded in mechanism by ADR-033: the
active Profile is application-level context (a session-derived cookie),
not a URL segment.

## ADR-026 — Inline tags

Accepted. Superseded in shape by the product-polish pass (still accepted,
storage/scoping unchanged) — see below.

Account and Transaction records store independent inline JSON:

```ts
string[]
```

A flat list of opaque, user-defined strings — not key/value (the original
version of this ADR specified `Record<string, string>`; product-polish
replaced it with a simple tag list, no typed/hierarchical semantics).

No global Tag entity and no tag join tables.

Reason:

- tags are views/metadata
- changing one record's tag must not rename/change other records
- simple MVP storage
- avoids unnecessary global tag lifecycle

## ADR-027 — Progressive transaction entry

Accepted.

MVP provides:

- Simple mode for common two-leg transactions
- Split mode for multi-posting transactions

Core accounting model remains generic N-posting.

## ADR-028 — Posting-level invariants

Accepted.

Every Posting must have exactly one positive side.

```text
debit >= 0
credit >= 0
exactly one > 0
```

Every Transaction must have at least two Postings and balance.

These are domain rules, not UI-only validation.

## ADR-029 — AppUser/Profile identity replaces Family/Member

Accepted (2026-08-20 User Simplification delta — see
`docs/completed/2026-08-20-User-Simplification.md` for the full spec).

Supersedes ADR-006's "Members do not require registration" framing and the
Member-ownership wording in ADR-018/ADR-025: the underlying invariant is
unchanged (every Transaction/Account resolves to exactly one owning
identity), only the vocabulary and the addition of real authentication.

- Family (a per-installation, later a per-database-boundary container) is
  removed entirely — not replaced by an equivalent ownership container.
- AppUser is the real login identity (email/password, session-based).
- Each AppUser is linked to exactly one Profile (the financial identity,
  renamed from Member); a Profile can also exist unlinked.
- The Primary User (first AppUser ever registered in the Hosted Instance)
  can access every Profile via `/profiles`; a normal AppUser has exactly one.
- One Hosted Instance = one physical database file — no more per-Family
  database isolation (that model, specified in the now-deleted
  `docs/v9-delta/` files, was implemented once and then reversed by this
  delta).

## ADR-030 — Import adapters are keyed `institution.product.format`

Accepted (2026-08-25 Import Framework delta).

Registered in explicit priority order; a generic-CSV adapter is always
registered last as the universal fallback when no institution-specific
adapter's `detect()` matches. An adapter owns only recognizing/parsing its
source format and extracting a source account identifier — never
Ledger-specific categorization or accounting intelligence.

## ADR-031 — Account identity for import resolution is a child `AccountIdentifier` entity

Accepted (2026-08-26 Account Resolution delta).

Not a JSON/list column on `accounts` — a separate `account_identifiers`
table (`id`, `account_id`, `identifier`), independently queryable/indexed,
so one Account can have multiple known representations (a full account
number plus masked variants observed across statements).

Resolution order: exact identifier match; then a masked-suffix "possible
match" heuristic (one identifier's unmasked significant suffix is a
trailing suffix of the other's full string); then, if more than one Account
plausibly matches, ambiguous — always requires user resolution, never
auto-merged. A newly created Account's identifier gets its masked variants
(last-4, `XX`+last-4, `XXX`+last-4) derived and stored up front; confirming
an existing-account match for a not-yet-known identifier adds it
(user-approved learning, not automatic).

## ADR-032 — Import commit is atomic; account creation is deferred to approval

Accepted (2026-08-25/26 Import Framework deltas).

Preview and every edit to it (row edits, bulk edits, changing a proposed
account's resolution) are transient client-side state only — nothing is
persisted. Approval runs one atomic transaction that creates every approved
new Account (source or counter-account alike — a proposed "Unknown"
catch-all is exactly as much a proposed Account as a proposed bank account,
not a special temporary import bucket), its `AccountIdentifier` rows, the
`ImportFile` provenance row(s), and the resulting Transactions/Postings.
Nothing commits to the Ledger before explicit user approval (delta §9).

## ADR-033 — Profile is application-level context, not a URL segment

Accepted (2026-08-26 routing-flattening delta). Supersedes ADR-025's
mechanism note (vocabulary/authentication substance unchanged).

Routes are flat and top-level (`/accounts`, `/transactions`, `/imports`,
`/settings/...`), nested only for genuine resource relationships
(`/accounts/[accountId]`, `/settings/profiles/[profileId]/edit`) — no route
carries a `profileId` merely to address "the current Profile." The active
Profile is resolved server-side by `requireActiveProfile()`
(`src/server/authz.ts`) from an `activeProfileId` cookie, falling back to
the AppUser's own Profile; `cache()`-wrapped so a layout and its page
calling it in the same request cost one DB lookup. Every Server Action that
previously took `profileId` as a caller-supplied parameter now derives it
the same way instead, except the few that inherently address a *different*
Profile by id (switching to it, or a Primary User acting on an arbitrary
Profile from the `/settings/profiles` admin roster) — those keep an
explicit `profileId` parameter, since there is no "current" Profile to fall
back to for those cases.

Accepted trade-off: switching the active Profile is a single global cookie,
not per-tab URL state — changing it in one browser tab changes it
everywhere in that browser.

`settings/backup` and `settings/currencies` are not built as part of this
delta (no existing implementation or spec for either) — only
`settings/profiles` (a real, pre-existing feature) moved under `/settings`.

## ADR-034 — PDF import adapters and password-protected files

Accepted (2026-08-26, first PDF adapter — Federal Bank Account PDF).

`ImportAdapter.parse()` is `async` for every adapter (`Promise<ParsedFile>`)
so a PDF adapter can use `pdfjs-dist` (Node "legacy" build) without a
separate sync/async adapter split; the three existing XLS/CSV adapters just
wrap their already-synchronous body in an `async` function, no logic
change. `detect()` stays synchronous and shallow for PDFs specifically
(filename + `%PDF-` magic bytes only) — encrypted content can't be peeked
at pre-password, so institution confirmation happens inside `parse()`
instead, same "detect loosely, parse validates precisely" split the other
adapters already use.

PDF table extraction has no cell/row grid the way a spreadsheet does —
`getTextContent()` returns positioned text runs. Column boundaries are
derived from the header row's own item x-positions (nearest-anchor
classification, tolerant of the header label's visual position not exactly
matching the data's left edge), and physical text lines are grouped into
logical transaction rows by which ones start with a date in the first
column; a wrapped multi-line Particulars/description is a continuation
line with content only in that column, merged into the open row.

Password handling: `PasswordRequiredError` (`reason: "required" |
"incorrect"`) surfaces through `ActionResult`'s new optional `code` field
(`PASSWORD_REQUIRED` / `PASSWORD_INCORRECT`) — additive, every other
action's plain `{ success: false, error }` result stays valid. The
`ImportWorkspace` UI prompts for a password only on that signal, resends
the same preview call with it attached, and never stores it: it lives in
one `useState` inside a dialog component that's only mounted while a
password is actually pending, unmounted (and the value discarded) the
moment the retry succeeds or is cancelled. The password is never written
to the `ImportFile` row, a log, or anywhere else — approval/commit never
re-reads the original file bytes, so it never needs to flow past the one
preview parse call that used it.

## ADR-035 — Recurring Rule schedule is structured columns, not a stored RRULE string

Accepted (2026-08-28, Recurring Transactions Phase 1 —
`docs/completed/2026-08-27-Recurring-Transactions.md`).

A Recurring Rule is a definition (Name, Transaction Template, Schedule),
not a Transaction — creating or editing one never touches the Ledger
(rule: no automatic transaction generation in Phase 1). The delta's own
FinBodhi-derived example schedule used an RFC5545 RRULE string (`FREQ=
MONTHLY;INTERVAL=1;BYMONTHDAY=7`); this was deliberately rejected in
favor of plain structured columns (`frequency`, `interval`, `by_month_day`,
`by_weekday`, `start_date`, `end_date`) — an opaque RRULE blob would need a
parser/serializer dependency just to read a schedule back for the Rules
table or the edit form, for a scope (four frequencies, one interval, one
day field) that plain columns already model directly and transparently.
`nextOccurrence`/`occurrencesInRange` (`src/domain/recurring.ts`) still
follow RRULE-shaped semantics — `by_month_day`/`by_weekday` are the
recurrence anchor, independent of `start_date`'s own day-of-month/weekday,
same as RFC5545's BYMONTHDAY/BYDAY overriding DTSTART — it just isn't
RFC5545 syntax. No new dependency was added; next-occurrence is a forward
scan over native `Date` UTC math, capped at 10,000 iterations as a
pathological-input guard. `by_month_day` clamps to the target month's
actual length (day 31 in February → the 28th/29th) rather than RFC5545's
"skip the month entirely" — simpler and friendlier for Phase 1's UI, not a
literal RFC5545 implementation.

"Next due" is derived on read (`listRecurringRulesWithNextDue`), never
persisted or cached — Phase 1 has no automation to keep a cached value
fresh against, so a cache would add invalidation complexity for no benefit
yet.

The Calendar tab (spec §7) is a pure view over the same rules — occurrences
for the visible month are computed via `occurrencesInRange` on every
render, never a separate source of truth. Its month-grid math (day/weekday
numbering) is shared with `ui/date-picker.tsx`'s existing custom calendar
rather than reimplemented.

"Make recurring" (spec §3) prefills the same `RecurringForm` used by
"Recurring → Add New" (spec §14: one form, not two) from an existing
transaction's From/To Account, Amount, and Description — offered only for
a normal non-split, single-From transaction (spec §11/§13; same guard as
the row menu's existing Split Transaction entry). The two objects stay
independent after creation: editing the rule never modifies the source
transaction, and vice versa.

## ADR-036 — Budget scope/filter is Budget-domain specific; a Period's snapshot is mutable only while current

Accepted (2026-09-02, Budget Framework —
`docs/completed/2026-09-01-Budget-Framework.md`).

Four related implementation decisions from that delta, none dictated
unambiguously by its own text:

**Budget's condition filter is a separate type from Transaction List's
`TransactionFilterState`** (`src/lib/transaction-filter.ts`), per the
delta's own explicit instruction (§7: "remain Budget-domain specific
rather than directly coupling persistence to arbitrary Transaction List
filter internals") — despite the row-editing UI looking similar.
`BudgetFilterCondition`/`BudgetFilterState` (`src/domain/budget.ts`) cover
only the four fields the delta scopes (Expense Account/Date/Tags/
Description), add a third `NONE` match mode Transaction List's filter
doesn't have, and `expenseAccount` resolution only ever looks at a
transaction's EXPENSE-classified postings (`src/lib/budget-filter.ts`) —
Budgets are expense-only (§14), so a transfer between two non-expense
accounts can never match a Budget filter regardless of its conditions.

**A Budget Period is a window (`start_date`/`end_date`), not a single
occurrence date** — unlike a Recurring Rule's `nextOccurrence` (ADR-035),
which asks "what date is the next transaction," a Budget Period asks "what
date range does the Nth period span." `budgetPeriodWindowAt`/
`currentOrNextBudgetPeriod`/`nextBudgetPeriodAfter`
(`src/domain/budget.ts`) are a parallel forward-scan implementation, not a
reuse of `domain/recurring.ts`'s point-in-time functions, even though both
share the same DAY/WEEK/MONTH/YEAR-style clamping posture for month-end
anchors. A ONE_TIME Budget's single Period always has null `start_date`/
`end_date` — the delta is explicit (§4.1) that a one-time Budget requires
no transaction date range, so actuals calculation skips date filtering
entirely when both are null (`calculateBudgetActuals`,
`src/server/use-cases/budgets.ts`).

**Editing an active Budget's scope/allocations updates its current
(latest, not-yet-superseded) Period's snapshot in place; only Periods
other than the current one are ever frozen against later edits.** The
delta's own warning copy (§10: "changing this Budget can change... current
actual spending") only makes sense if the edit is live; §11.1's "must not
rewrite historical Budget Period configuration" is read as protecting
*closed* Periods specifically. `editBudget` therefore calls
`updateBudgetPeriodSnapshot` on `findLatestBudgetPeriod`'s result;
`approveBudgetPeriod` (the separate §5/§16 review flow) is the only path
that ever creates a new, independently-frozen Period. The scope-change
warning itself (§8.3/§10) is enforced client-side only
(`src/components/budget-form.tsx`'s `ConfirmDialog` gate on the edit
submit path) — the use-case layer applies the change unconditionally once
called, same posture as every other confirm-before-mutate flow in this
codebase (e.g. `DeleteBudgetButton`).

**"Ending soon" (§16/§17) has no defined threshold in the delta — its
mockups only ever show one example ("Ends in 5 days") without stating the
window that copy should appear within.** `BUDGET_REVIEW_WINDOW_DAYS = 7`
(`src/server/use-cases/budgets.ts`) is this implementation's own chosen
cutoff: `listBudgetsWithSummary`'s `reviewDue` flag goes true once a
RECURRING Budget's current Period has ended or is within 7 days of ending
*and* a next Period actually exists to review (schedule not terminated).
This only controls when the "Review Next Period" affordance appears on the
Budgets landing page and Home dashboard — approval itself is always an
explicit user action either way (§5), so a wrong threshold is a UX
nit, not a correctness risk. Revisit if a real usage pattern calls for a
different window or a user-configurable one.

## ADR-037 — Panel Registry splits data from rendering; drop placement is a narrow swap-or-reject heuristic

Accepted (2026-09-02, Dashboard and Panels —
`docs/completed/2026-09-02-Dashboard-and-Panels.md`).

Three implementation decisions from that delta, none dictated
unambiguously by its own text:

**The Panel Registry (spec §8) is two files, not one.** Its "rendering
component" field can't live next to its data-shaped fields (name/
description/category/dimensions/configuration schema) — domain must not
depend on React (`docs/06-architecture.md`), and every panel component
reads the database directly via `db` from `src/server/db/client.ts`, which
bundles `better-sqlite3` and cannot be imported into client code.
`domain/dashboard.ts` holds the client-safe half (`PANEL_NAME_BY_KEY`,
`PANEL_DESCRIPTION_BY_KEY`, `PANEL_CATEGORY_BY_KEY`,
`PANEL_DIMENSIONS_BY_KEY`, `CONFIGURABLE_PANEL_KEYS`) —
`src/components/dashboard-grid.tsx` (a Client Component, for hover
controls and drag-and-drop) reads this half directly. `src/lib/panel-
registry.tsx` holds the server-only rendering half (a `renderPanelContent`
switch over `PanelKey`) and must only ever be imported from a Server
Component (today: `src/app/(app)/page.tsx`) — importing it from a Client
Component would attempt to bundle the database driver for the browser.

**Drag-and-drop needed a new dependency** — no drag/collision/placement
library existed anywhere in this codebase already. `@dnd-kit/core` (+
its `@dnd-kit/utilities` companion for the CSS transform helper) was
added: small, accessible-first (keyboard sensor support out of the box),
headless, fitting this codebase's existing Base UI/headless-component
style. The actual placement *rule* is deliberately kept out of dnd-kit
entirely, in a pure function (`resolveDrop`,
`src/lib/dashboard-grid-layout.ts`) unit-tested without a DOM: an empty
drop target always succeeds; a target fully covered by exactly one
same-dimensions panel swaps the two; anything else (partial overlap,
multiple panels in the way, mismatched dimensions) is rejected outright
and the drag snaps back with no action call at all. The spec never
specifies collision behavior beyond "panels are movable" (§13) — a full
bin-packing/reflow algorithm was considered and rejected as
disproportionate for Phase 1's fixed 1x1/2x2 dimension set; the narrow
heuristic covers every case the Starter Dashboard's own layout and any
reasonable rearrangement of it can produce.

**`useDraggable` is called exactly once per panel**, in the outer
draggable container, not a second time in a separate drag-handle
component — an early draft called it twice (once per component instance)
for the same id, which fights over dnd-kit's internal registry. The fix:
call the hook once, pass its `attributes`/`listeners` down as props to the
grip-handle button, and apply `setNodeRef`/the transform style to the
outer container. Caught during Phase D implementation, not shipped.

## ADR-038 — Quantity/price move to the posting, not the Account; balance check generalises to reconciliation value

Accepted (2026-09-03, "Revised Investment Model" delta — supersedes §4 of
`docs/completed/2026-08-21-Instrument-Model-Pricing-Foundations.md`, which
put quantity on the Account).

**Quantity and price are posting-level fields** (`postings.quantity`,
`postings.price`, `src/domain/posting.ts`), not Account-level. Reasoning:
an Account's "quantity" only ever means something as the sum of the
postings against it (same relationship debit/credit already has to
balance) — modelling it as a separate Account-level field would create a
second source of truth that every posting write has to keep in sync by
hand. `quantity` is an integer at a fixed 6-decimal scale
(`domain/quantity.ts`, `QUANTITY_SCALE`), the same reasoning as Money's
own integer-minor-units rule (ADR-022): it gets summed for holdings
derivation, where float drift would compound. The scale is fixed and
global rather than per-Currency (unlike Money) because a Quantity isn't
always a currency amount — an Instrument leg's units have no owning
Currency to take a scale from.

**Every posting carries a quantity/price, not just Instrument-backed
ones.** For an ordinary posting, `quantity` mirrors the posting's own
debit/credit amount and `price` is forced to `1` — a same-currency
Transaction reduces to exactly the old raw-minor-units balance check, a
strict generalisation rather than a new rule for the common case. This
also gives the one differing-currency leg a Currency Conversion can have
(a 2-posting shape, shipped 2026-09-03 alongside the Currency Catalogue —
`docs/04-modules.md`) an explicit, persisted rate — previously that rate
was only ever implicit in the two
legs' independently-chosen amounts. For an Instrument-backed Account,
`quantity` is the real unit count (shares/units bought or sold) and
`price` is a free per-unit cost; the posting's own amount must equal
`round(quantity × price, accountCurrencyScale)` (`VALUE_MISMATCH`
otherwise) — `src/domain/transaction.ts`.

**The balance check itself generalises from "debit minor-units sum ==
credit minor-units sum" to "debit reconciliation-value sum == credit
reconciliation-value sum"**, where reconciliation value is `quantity ×
price` converted into the *reconciliation currency* (by convention the
credit side's own currency — the same "From = credit side" convention
already used elsewhere, e.g. `src/lib/transaction-rows.ts`). The existing
Currency Conversion exemption from balancing is unchanged; mixed-currency
shape detection (`MIXED_CURRENCY_UNSUPPORTED`) runs first, unaffected by
this delta.

**Not done by this delta** (`postings.price` is a DB `real`, not backed by
persisted market data): Instrument identifiers (provider codes), a
pricing-provider abstraction, reference-price storage/provenance, actual
free-provider integrations, and derived account valuation — steps 2 and
7-10 of the original 10-step plan. The Conversion leg's rate is still
auto-derived from the two legs' own amounts, not a field the transaction
form lets a user type directly — deferred to whenever that UI is built.
No DB-level foreign key from `accounts.instrument_id` to `instruments.id`
either: SQLite can only add an FK to an existing table via a full
table-recreate requiring `PRAGMA foreign_keys=OFF`, a documented no-op
inside a transaction, and drizzle's `migrate()` wraps a whole migration
file in one transaction — reproduced firsthand attempting this migration.
Enforced at the use-case layer instead, this codebase's existing default
posture for most relationships.

## ADR-039 — Catalogue identity lives in flat columns, not a child InstrumentIdentifier entity; search moves server-side

Accepted (2026-09-04, Instrument Catalogue delta —
`docs/completed/2026-09-04-Instrument-Catalogue.md`). Supersedes the
catalogue portions (§5, §9-§11) of `docs/completed/2026-08-21-Instrument-
Model-Pricing-Foundations.md`.

**`nseCode`/`bseCode`/`isin` are flat nullable columns on `instruments`**,
not a separate `InstrumentIdentifier(provider, code)` child entity as the
original 2026-08-21 doc's §5 sketched. The Catalogue delta's own §3 spells
out the flat schema directly, and there are exactly two fixed providers in
play (NSE, BSE) plus ISIN — a generic multi-provider identifier table
would be speculative machinery for a shape that doesn't exist yet. Revisit
if/when a real second data source needs provider-keyed identifiers this
shape can't express.

**Catalogue identity — `(source, sourceId)` — is a use-case-layer upsert
match, not a DB unique index.** Same reasoning as ADR-038's
`accounts.instrumentId`: SQLite can only add a constraint to an existing
table via a full recreate, this codebase's migrations already avoid that
class of change. `upsertCatalogueInstruments`
(`src/server/repositories/instruments.ts`) looks up existing rows by
`(type, source)` once, matches in memory by `sourceId`, and is strictly
additive/updating — it never deletes, which is also what makes the
delta's "a failed/unusable refresh must not wipe the existing catalogue"
requirement true by construction rather than a separate rule to get
right.

**The Account form's Instrument picker was rewritten from a full-fetch-
then-client-filter combobox to a 250ms-debounced per-keystroke server
search.** The prior version (Revised Investment Model delta, ADR-038)
fetched every Instrument of the selected type on open and filtered
client-side — correct when the catalogue held only user-created rows, but
wrong once a real ingested catalogue can hold ~5600 stocks: that would
mean shipping the whole list to the browser on every open. `search
Instruments` (`src/server/repositories/instruments.ts`) now runs a SQL
`LIKE` across name/nseCode/bseCode/sourceId server-side, capped at 25
results; an empty query returns nothing rather than the whole type, and
the picker shows a "Type to search…" hint instead of fetching.

**The real IndianAPI mutual-fund feed was inspected before writing its
mapping** (the delta's own instruction, not assumed from the stock feed's
shape): it is a nested `{ category: { subCategory: [fund, ...] } }`
object, not a flat array. Only `id`/`mfName` are kept; the feed's NAV/
returns/star-rating fields are pricing data (delta §8 non-goal) and are
dropped rather than carried into the catalogue. No NSE/BSE/ISIN exist in
this feed for funds — those three stay null on every MUTUAL_FUND
catalogue row, same as the original delta's §5 anticipated ("do not
assume all identifiers are present").

## ADR-040 — Ledger/Portfolio delink: supersedes ADR-038/039's Account↔Instrument bridge

Accepted and implemented (2026-09-05, following the Folioman architecture
study — `analysis/folioman-vs-ledger/06-pwa-validation-and-domain-delink.md`
decided this; this entry records the actual implementation).

**Ledger Accounts can never be Instrument-backed again.** `MUTUAL_FUND`/
`STOCK`/`COMMODITY` are removed from `INSTRUMENT_TYPES`/
`TYPES_BY_CLASSIFICATION` (`src/core/shared/accountTypes.ts`) — an Asset
Account's only types are now `CASH`/`BANK`. This directly reverses ADR-038
(2026-09-03), which put `quantity`/`price` on every posting specifically
so an Instrument-backed Account's purchase/sale could be validated as a
normal double-entry Transaction, and ADR-039 (2026-09-04), which wired the
Instrument Catalogue to `accounts.instrumentId` via an Account-form picker.
Both were real, shipped, browser-verified features — this isn't walking
back a mistake, it's a deliberate later direction change: Portfolio gets
its own `InvestmentTransaction`/`PortfolioAccount`/`Holding` model
(Folioman's actual shape, `analysis/folioman-vs-ledger/
07-folioman-database-model.md`), never Ledger's `accounts`/`postings`.

**What stayed, deliberately.** `postings.quantity`/`postings.price` and
the domain layer's reconciliation-value balance check
(`core/ledger/transactions/transaction.ts::validateTransaction`) are
**not** reverted — they still exist and still generalize the balance
check to support Currency Conversion's persisted exchange rate, a Ledger-
only feature unrelated to Portfolio. Only the `account.isInstrumentBacked`
branch and its `VALUE_MISMATCH` violation code are removed; every posting
now unconditionally mirrors its own amount as `quantity`, and `price` is
forced to 1 except on the one differing-currency Conversion leg — exactly
ADR-038's original same-currency case, just without the Instrument
exception. The Instrument Catalogue backend (`server/repositories/
instruments.ts`, `server/services/{instruments,catalogue}.ts`,
`server/actions/instruments*.ts`, `server/catalogue/*`, the `instruments`
table and its real IndianAPI ingestion) is **fully preserved** — it never
depended on `accounts` at the schema level, only through the now-removed
`accounts.instrumentId` linkage, so it's already a standalone, reusable
building block for the future Portfolio module. `INSTRUMENT_BACKED_TYPES`/
`InstrumentBackedType` (`core/portfolio/instruments/instrument.ts`) now
stand alone too — the catalogue's own frozen type list, no longer derived
from or referencing `core/ledger`'s account types at all, enforced by a
new ESLint rule banning `core/portfolio` from importing `core/ledger`
outright (`eslint.config.mjs`,
`analysis/folioman-vs-ledger/08-target-architecture-implementation-plan.md`
Phase 1a).

**What's deliberately left inert, not migrated.** `accounts.instrumentId`/
`instrumentLabel` columns stay in the schema (no longer written by
`createAccount`/`editAccount`'s input types, which drop the fields
entirely) rather than being dropped in a migration now — matching this
codebase's established "leave inert, migrate for real once the
replacement exists" posture from `06-pwa-validation-and-domain-delink.md`.
Any Instrument-backed Account created under the old model (this session's
own dev database may have none, since the feature shipped and was
reverted within the same session) becomes a real Phase 3 data-migration
concern — converting it into the new `PortfolioAccount` shape — not
something this delink attempts to resolve retroactively.

**UI surface removed, not preserved behind a flag.** The Account form's
Instrument picker, the transaction form's Units field (gated on an
Instrument-backed destination), the transaction list's per-leg
quantity/unit-price secondary display, and the now-orphaned
`InstrumentPicker` component are deleted outright, not hidden — per this
codebase's own "if you are certain something is unused, delete it
completely" convention, since nothing can trigger these paths anymore
once no Account can be Instrument-backed.

## ADR-041 — Portfolio V1: Folioman-shaped domain, CAS import via a local Python subprocess

Accepted and implemented (2026-09-05, following `analysis/folioman-vs-ledger/`
`LedgerAppPortfolioAdoptionPlan.md`'s adopt-now list). First real content in
`core/portfolio` since the Ledger/Portfolio delink (ADR-040) — `Instrument`
(already existed), `PortfolioAccount`, `Folio`, `InvestmentTransaction`,
`Holding`, `NAVHistory`, `PortfolioImport`. New tables: `portfolio_accounts`,
`folios`, `investment_transactions`, `holdings`, `nav_history`,
`portfolio_imports`; `profiles` gains `panEncrypted`/`panHash`. Zero FKs into
`accounts`/`transactions`/`postings` anywhere in this set, and the ESLint
rule from ADR-040/Phase 1a (`core/portfolio` can't import `core/ledger`)
still holds — verified by the whole module compiling under it.

**`InvestmentTransaction` is deliberately smaller than Folioman's own
Transaction** — the plan's own instruction: no `fx_rate_to_inr`/`fees`/
`stamp_duty`/`brokerage`/`cost_total`/`cost_basis_complete` yet. Its one real
domain invariant (`core/portfolio/transactions/investmentTransaction.ts`)
is `units × price == amount`, the single-sided equivalent of the
Instrument-backed posting check ADR-040 just removed from Ledger. One
necessary refinement past the plan's own text: `DIVIDEND` is exempted from
that check entirely — a cash payout has no unit/price component at all, and
CAS statements report real `DIVIDEND_PAYOUT` rows this shape has to accept.

**`Holding` is an observed snapshot, never the computed position** —
Folioman's own `HoldingSource.LEDGER` ("derived in-memory, never
persisted") generalized into a rule: the current position is always
`netUnitsFromTransactions` run fresh over `investment_transactions`
(mirrors `accountBalance` summing `postings` fresh, Ledger's own established
posture), and `holdings` rows only ever come from a real external
observation (a CAS closing balance, a manual entry).

**`dedup_key` gets a real DB-level partial unique index**
(`uniq_investment_transaction_profile_dedup`, `(profile_id, dedup_key) WHERE
dedup_key IS NOT NULL`), unlike most relationships in this codebase — unlike
an FK, SQLite can add a plain unique index to an existing table without a
recreate, so ADR-038's own PRAGMA/table-recreate limitation never applies
here. Same treatment for `nav_history`'s `(instrument_id, date)`.

**CAS PDF import runs `casparser` (the same Python library Folioman itself
uses) as a local subprocess**, not a from-scratch TypeScript parser and not
a remote parsing API — the one real architecture decision this delta
required a stop-and-ask for for (rule #20's own procedure): no local Node
CAS parser exists, and the one npm package found (`cas-parser-node`) is a
client for a hosted API, which would violate Import Privacy (rule #23 — a
CAS PDF carries PAN, holdings, and transaction history; nothing about a
statement may leave the machine). `scripts/cas_parser.py` is a ~40-line
wrapper around `casparser.read_cas_pdf(..., output="json")`;
`src/server/casImport/runCasParser.ts` spawns it, writes the uploaded PDF to
a throwaway temp file (deleted in a `finally`, never persisted — same
"password/raw file never stored" posture as the existing Federal Bank
Account PDF import adapter's own `PasswordRequiredError`), and parses its
stdout. The mapping/persistence logic (`services/casImport.ts`) depends on
the parser only through an injectable `CasParserRunner` function — the same
DI seam `services/catalogue.ts` already established for its own external
HTTP call — so the whole import pipeline (Instrument/Folio resolution,
transaction-type mapping, dedup, holding-snapshot recording, idempotent
re-import) is unit-tested against a synthetic JSON fixture matching
casparser's real schema, with no real PDF, no real subprocess, and no real
PAN anywhere in the test suite (AGENTS.md rule #24). **This adds Python 3 as
this codebase's only non-Node runtime dependency** — required wherever CAS
import needs to work, not for anything else the app does.

**Not built in this pass, deliberately** (plan §3/§4 "Later"/"Maybe"): NSDL/
eCAS (demat) CAS parsing — only the CAMS/KFin MF shape is mapped; corporate
actions, partial-history chaining, reconciliation, `FXRate`,
`InvestorValue`, `SecurityIntegrityStatus`; any UI/Server Actions layer
(this delta is domain + persistence + services only, matching the plan
document's own framing); an actual NAV-fetching provider (`recordNav`
exists, nothing calls it yet — pricing steps 7-9 of the original
2026-08-21 doc remain not started).

## ADR-042 — Portfolio gets its own top-level nav section and Security/Holding vocabulary; CAS import gets a review step before commit

Accepted and implemented (2026-09-05, Portfolio UI/Navigation Model delta —
the UI/Server Actions layer ADR-041 explicitly deferred).

**Portfolio is a top-level nav section, not a tab under Accounts** —
Overview, Mutual Funds, Stocks, Accounts/Folios, and Imports, mirroring
Ledger's own top-level Accounts/Transactions/Imports split
(`src/components/nav-items.ts`). A separate **Import Center**
(`/import-center`) is the cross-domain view over both Ledger's and
Portfolio's import history side by side; each domain also keeps its own
contextual import entry point (`/imports`, `/portfolio/imports`) — Import
Center is a read/navigate surface, not a third place uploads happen.

**"Security" (the investment itself) and "Holding" (the Profile's position
in it) are kept as two distinct, consistently-labeled concepts** in every
Portfolio screen (`portfolio-security-detail.tsx`'s "About this Security"
vs "Your Holding" sections, `portfolio-asset-class-overview.tsx`'s list
labelling) — resolved during UX review as a real point of confusion in an
early draft that used "Security" for both. "Instrument" (the catalogue/DB
term, `core/portfolio/instruments`) stays backend-only vocabulary, never
shown to a user.

**CAS import gained a review step before commit** (`previewCasImport`/
`CasImportForm`'s two-step upload → review-counts → confirm flow,
`src/server/services/casImport.ts`), correcting the original ADR-041
implementation's direct upload-and-commit — the same Upload → Preview →
Approval → Commit shape Import Framework (ADR-032) already established for
Ledger statement import, applied to Portfolio's own PDF/CSV imports for
UX consistency across both domains rather than a domain-specific shortcut.
Every Portfolio import built afterward (Stock tradebook, demat eCAS —
ADR-043/ADR-045) follows the same preview/commit split from the start.

**A CAS statement's PAN not matching the active Profile's registered PAN
is a hard rejection (`PanMismatchError`), not an offer to create a new
Profile** — Folioman's own `resolve_or_create_investor` auto-creates an
investor record on a PAN mismatch; this was considered and explicitly
deferred pending a real decision on who should be allowed to trigger
Profile creation from an import flow and what confirmation it needs. A
Profile's PAN is `profiles.panEncrypted`/`panHash` (ADR-041); a Profile
with none registered yet skips the check entirely (a soft "no PAN set"
warning on the import page instead) rather than blocking every import
until one exists.

## ADR-043 — Stock Tradebook import mirrors Ledger's own adapter architecture; trade ID joins the dedup key from day one

Accepted and implemented (2026-09-06, Stock Tradebook import plan Phase 1).

**Tradebook import reuses Ledger's `institution.product.format`-keyed
adapter pattern** (ADR-030), not Folioman's own browser-side column-mapping
wizard — `zerodha.tradebook.csv` (a real Zerodha delivery-tradebook CSV
shape) plus `generic.tradebook.csv` (header-alias fallback) under
`src/server/portfolioImporters/`, one consistent import UX paradigm across
both Ledger and Portfolio rather than a second bespoke pattern. Unlike
CAS's auto-resolved Folio, the destination PortfolioAccount and Folio are
picked (or created inline) by the user before preview — a tradebook file
carries no PAN/investor identity to auto-resolve one from.

**The dedup key includes the broker's own trade ID from the start**
(`services/tradebookImport.ts`'s `dedupKey`), unlike CAS's dedup key, which
needed a follow-up fix (ADR-041's own `balance`-field addition) after
shipping without it. A same-day, same-price, same-quantity pair of fills
from two different orders is a real, documented bug class in this space
(Folioman's own dedup notes) — closed here before it could happen, not
after.

**`getOrCreateInstrument` sets `instruments.nseCode` from the broker's own
trading-symbol column** — a best-effort guess (most Indian brokers already
use the NSE trading symbol directly), not a catalogue-verified NSE code; a
wrong or BSE-only guess just means that one Instrument's price feed
(ADR-044) finds nothing until a real catalogue link corrects it, never a
crash.

## ADR-044 — NAV refresh (AMFI + NSE), XIRR, and a cut-down Holding-integrity signal

Accepted and implemented (2026-09-06, Stock Tradebook import plan Phase 2
+ the valuation build that preceded it).

**An AMFI bulk NAV feed refreshes every catalogued Mutual Fund in one
request** (`priceFeeds/amfiNav.ts`'s `fetchAmfiNavAll`) — the free public
`NAVAll.txt` file, keyed by ISIN or AMFI code (whichever resolved the
scheme at CAS-import time). **Equities have no equivalent bulk file**, so
Stocks are refreshed one request each against NSE's own cookie-walled
historical-data endpoint (`priceFeeds/nseEquityHistory.ts`) — acceptable at
expected self-hosted single-profile scale. Both feeds are wired into one
`runNavRefreshIfDue` (`services/navRefresh.ts`), triggered opportunistically
from `after()` in the app layout, same "due since the history table's own
most-recent row, not a separate settings row" posture as the existing
`runBackupIfDue`.

**`getInstrumentValuation` computes a real signed XIRR** (Newton-Raphson
with a bisection fallback, ported from Folioman's own `xirr.py` into
`core/portfolio/valuations/xirr.ts`) over each Instrument's transaction
history, using the *NAV's own recorded date* as the terminal cashflow date
— not wall-clock "today." A NAV that's overdue for refresh is only ever
actually known as of the date it was last observed; using today's date
would silently overstate or understate the return whenever a refresh is
behind schedule (caught by a test with a deliberately stale NAV before
shipping).

**A cut-down Holding-integrity signal** (`classifyHoldingIntegrity`,
`core/portfolio/valuations/integrity.ts`) compares the transaction-implied
position against the most recent observed `holdings` snapshot per
Instrument, tolerance-based (`TOLERANCE_MINOR_UNITS`), returning
`VERIFIED`/`SNAPSHOT_ONLY`/`undefined` — deliberately not Folioman's full
five-state reconciliation model (which also detects corporate actions and
partial-history gaps); `undefined` means "nothing to compare against yet,"
not "verified." Shown as a badge on the Security detail page and the
asset-class overview.

## ADR-045 — Demat eCAS import: `file_type` is the CAS/eCAS discriminator; equities-only V1, Holdings never a transaction

Accepted and implemented (2026-09-06, Stock Tradebook import plan Phase 3).

**`casparser.read_cas_pdf` already auto-detects both statement shapes** —
confirmed by direct inspection of the installed library (not assumed):
the same function call returns `CASData` (CAMS/KFin, ADR-041's existing
shape) or `NSDLCASData` (NSDL/CDSL, a demat holdings *snapshot*, no
transaction history at all) depending on the PDF's own content.
`scripts/cas_parser.py` needed zero changes — it already just forwards
whatever JSON `casparser` produces. **`file_type` (`CAMS`/`KFINTECH`
vs. `CDSL`/`NSDL`, present on both result shapes) is the type guard
(`isEcasResult`, `casImport/runCasParser.ts`)** — chosen over checking for
`folios` vs. `accounts` key presence (the original plan) once the schema
inspection showed a field built for exactly this purpose already existed.
Both the MF CAS and eCAS import paths now reject the other's shape with a
clear message (`WrongStatementTypeError`) instead of the undefined-property
crash a wrong upload produced before this delta (a confirmed pre-existing
gap, fixed as a side effect).

**V1 reads only `account.equities`** — `mutual_funds`/`bonds` also exist on
the real NSDLCASData shape but are a deliberate cut: demat-held Mutual Fund
already has its own path via MF CAS, and Ledger's Portfolio domain has no
BOND instrument type to receive one (a separate, larger domain decision).
**An eCAS only ever calls `recordHolding`, never creates an
`InvestmentTransaction`** — Folioman's own `HoldingSource.ecas` is
holdings-only, and there is no eCAS-sourced transaction to port; unlike
CAS's transactions, `holdings` rows are never deduped, so re-importing the
same eCAS legitimately adds another point-in-time observation rather than
being rejected as a duplicate.

**Every demat account in one eCAS statement must agree on a single
investor PAN** (`MultiPanStatementError`, ported from Folioman's own
`ecas_investor_identity` cross-check) — checked independently of whether
the Profile has a PAN registered at all, unlike CAS's own profile-PAN
check. **PortfolioAccount/Folio are auto-resolved from the file's own
`dp_id`/`client_id`** (unlike tradebook import's manual picker, ADR-043) —
shown plainly in the preview/result as `dp_id-client_id` so a user can
copy that exact string into a tradebook's manually-typed Folio field if
they want the two sources to join under the Holding-integrity signal
(ADR-044); this is a UI nudge, not an automatic identity-merge algorithm,
since the two sources have no other way to agree on one Folio identity.

## ADR-046 — Yahoo Finance is a same-request fallback when NSE's feed misses, not a parallel or preferred source

Accepted and implemented (2026-09-06, Stock Tradebook import plan Phase 4).

NSE's own equity feed (ADR-044) is a cookie-walled scrape, genuinely more
fragile than AMFI's clean public bulk file. Yahoo Finance's chart JSON
endpoint (`priceFeeds/yahooFinance.ts`, no auth, no cookie wall) is wired
into `refreshStockNav` as a **fallback tried only on an NSE miss**, per
Folioman's own "NSE preferred, Yahoo is the fallback" framing — not queried
in parallel, so a healthy NSE response never pays Yahoo's request cost.
Indian equities need an exchange suffix Yahoo's namespace requires
(`.NS`/`.BO`); built from the same `instruments.nseCode`/`bseCode` columns
the NSE feed and eCAS import (ADR-045) already populate, no new column.
The `nav_history` row's own `source` field records which feed actually
answered (`"NSE"` or `"YAHOO"`) for later debugging, with no UI surface for
it yet. No retry/backoff on either feed — added only if real-world 429s
prove it necessary.
