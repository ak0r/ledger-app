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

Accepted. MVP supports INR only. No FX or currency conversion.

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
