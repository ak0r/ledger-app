# Open Decisions

This file contains only decisions intentionally deferred or requiring future design.

## Opening balance UX

Accounting principle is fixed.

UX can later determine whether opening balances are:

- guided setup
- account action
- dedicated transaction type

## Tag UI evolution

Storage is fixed as inline `string[]` (simple opaque tags — product-polish
pass, superseding the earlier `Record<string,string>` shape).

Resolved: TagInput suggests previously-used tags via a lightweight
distinct-values read (`listDistinctTags`), no new persistence.

No global Tag entity is planned.

## Investment model

Future design required for:

- STOCK
- METAL
- MUTUAL_FUND
- ETF
- quantity
- unit price
- valuation
- cost basis
- tax rules
- price feeds

## Multi-currency / FX

Future design required for:

- additional currencies
- FX rates
- conversion
- FX gain/loss
- cross-currency transactions

## Spaces

Future design required for:

- PERSONAL / SHARED spaces
- member participation
- archived spaces

## Expense sharing

Future design required for:

- expense allocation between Profiles
- receivables/payables
- settlements
- shared-space visibility

Accounting splits and expense sharing must remain separate concepts.

## Imports

Decided and shipped (2026-08-25/26 deltas — see `docs/04-modules.md`):
CSV/XLS/PDF via a real adapter (generic CSV, HDFC Bank Account XLS, Axis
Bank Account XLS, IDFC FIRST Bank Account XLS, Federal Bank Account PDF),
account resolution (`AccountIdentifier` matching), review workflow, atomic
commit. Password-protected import files (ADR-034) — the password is
prompted for in the UI, used once server-side to decrypt, and never
persisted.

Still future design required for:

- email
- SMS
- PDF statements from any other institution
- any adapter beyond the five shipped
- Rules (auto-categorization) plugin
- Duplicate Detection plugin

## Recurring Transactions

Decided and shipped (2026-08-28, Phase 1 — see `docs/04-modules.md` and
ADR-035 in `docs/07-decisions.md`): Recurring Rule definition model,
structured schedule (not RRULE), Rules list + Calendar view, `Add New` and
`Make recurring` entry points sharing one form.

Still future design required for:

- automatic transaction generation/posting from a due occurrence
- transaction matching/filtering (associating existing Transactions with a
  Recurring Rule, FinBodhi's `transactionFilter` concept)
- reminders / notifications
- recurring rules from split transactions

## Budgets

Decided and shipped (2026-09-02 — see `docs/04-modules.md` and ADR-036 in
`docs/07-decisions.md`): One-time/Recurring Budget model, explicit-account
+ filter scope (Budget-domain-specific filter type), Budget Allocations
with a derived total, never-persisted actuals, explicit "Review & Create"
approval per Recurring Budget Period with a frozen scope snapshot per
Period, `BUDGET_REVIEW_WINDOW_DAYS = 7` "needs review" heuristic on the
Budgets page and Home dashboard.

Still future design required for:

- Goals and Plans (this delta's own §2 distinguishes them from Budgets but
  defers both)
- envelope budgeting
- savings budgets
- an FX conversion engine for mixed-currency Budget scopes
- Budget insights/trends

## Transaction history

Future design required for:

- immutable versions
- edit history
- deletion history
- diff presentation
- retention

MVP uses hard delete and has no history UI.

## Authentication / sharing

Resolved: real AppUser authentication exists (2026-08-20 delta) — see
`docs/completed/2026-08-20-User-Simplification.md`. Still future design
required: sharing one Profile's data with another AppUser (today, a Profile
is linked to exactly one AppUser).

## AI / learning

Future design required for:

- categorisation
- parser assistance
- learning from corrections
- LLM provider/local model
