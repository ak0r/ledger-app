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

Decided and shipped as the separate Portfolio domain (2026-09-05/06 — see
`docs/04-modules.md`'s Investments section and ADR-040/041/043/044 in
`docs/07-decisions.md`): PortfolioAccount/Folio/InvestmentTransaction/
Holding/NAVHistory, STOCK/MUTUAL_FUND/COMMODITY InstrumentBackedTypes,
quantity/unit price on InvestmentTransaction, NAV valuation (AMFI + NSE/
Yahoo feeds), XIRR, a cut-down Holding-integrity signal.

Still future design required for:

- capital-gains/tax computation (LTCG/STCG, Schedule 112A)
- corporate-action (bonus/split) detection or replay
- cost basis beyond a simple per-transaction price
- ETF as an InstrumentBackedType
- demat-held Mutual Fund/Bond holdings from an eCAS (no BOND type exists)
- automatic Folio-identity reconciliation between a tradebook's manually
  typed Folio and an eCAS's auto-derived one
- retry/backoff on the Yahoo Finance feed

## Multi-currency / FX

Decided and shipped (2026-09-03 Settings/Backup/Data Management delta —
see `docs/04-modules.md`'s Currency Catalogue section): a Currency
Catalogue, a Profile Primary Currency, an independently changeable Account
Currency.

Still future design required for:

- FX rates / conversion between currencies
- FX gain/loss
- cross-currency Transaction aggregation (the one Currency Conversion
  2-posting shape persists an explicit rate for that transaction alone —
  not a general conversion engine)

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

## Dashboards and Panels

Decided and shipped (2026-09-02 — see `docs/04-modules.md` and ADR-037 in
`docs/07-decisions.md`): Homepage-is-the-default-Dashboard model, Starter
Dashboard auto-created per Profile (Net Worth/Assets/Liabilities/Balances/
Recent Expenses/Recent Transactions), a 7th catalogue-only panel (Budgets
Needing Review), a two-file Panel Registry (client-safe metadata in
`domain/dashboard.ts`, server-only rendering in `src/lib/panel-registry.tsx`),
fixed 1x1/2x2 Bento grid with `@dnd-kit/core` drag-and-drop and a narrow
swap-or-reject placement heuristic (`resolveDrop`,
`src/lib/dashboard-grid-layout.ts`), immediate no-confirm panel removal.

Also decided and shipped (2026-09-06, Ledger Dashboard System Phase 1):
three Dashboard contexts per Profile (Financial/Spending/Income,
`dashboards.context`), a server-only Panel Eligibility check
(`src/lib/panel-eligibility.ts`) that can decline to offer/render a panel
whose data prerequisite isn't met (with a visible reason, never silently
hidden or auto-removed once placed), a generic GitHub-style Heatmap
primitive (`src/components/heatmap.tsx`) with a fixed spending color
scale, and 8 of Phase 1's 10 planned analytical panels: Monthly Snapshot,
Spending Trend, Recurring Expenses, Daily Spending Heatmap (first pass),
then Savings Rate, Credit Card Health, Budget Health, What Deserves
Attention (second pass). Credit Card Health and Budget Health each gained
a real eligibility check (≥1 Credit Card account / ≥1 Budget). What
Deserves Attention only ever consumes the other panels' own already-
computed signals — it never runs a new calculation of its own.

Still future design required for:

- multiple Dashboards per Profile beyond the fixed three contexts (the
  data model already allows more — `dashboards.is_default` — but there's
  no UI to manage further ones)
- a Charts panel category
- Investment-dependent panels (Recent Investments/Portfolio Value/
  Portfolio NAV) — the Portfolio valuation model they'd read now exists
  (`docs/04-modules.md`), but no such panel has been built yet
- user-resizable panels
- separate mobile layouts / touch-friendly hover-control fallback
- **Income Allocation** (Phase 1, deliberately not built this pass): the
  delta's own worked example (Needs 46% / Wants 21% / Savings 33% =
  100%) implies the Savings bucket's "actual" is a residual
  (100% − Needs% − Wants%), while the same doc also asks the user to
  configure a Savings-bucket account assignment (Savings Account/
  Investments/PPF) — ambiguous which one the panel is actually meant to
  show. Needs a decision before implementation.
- **Fixed Commitments** change-tracking (Phase 1, deliberately not built
  this pass): "increased 14% over the last 12 months" needs a
  12-months-ago snapshot of commitments, but Recurring Rules carry no
  history (same gap already cut for Recurring Expenses' own
  change-tracking in the first pass) — needs either a new snapshot
  mechanism or a scope cut, matching Recurring Expenses.
- **Category Changes** "significant change" threshold (Phase 1,
  deliberately not built this pass): the delta says to "prioritize
  significant changes" with no numeric anchor (unlike the heatmap's exact
  ₹1000/₹2500 bands) — needs either a specified threshold or an explicit
  sign-off to pick one by judgment, the same way
  `BUDGET_REVIEW_WINDOW_DAYS = 7` was picked.

## Transaction history

Future design required for:

- immutable versions
- edit history
- deletion history
- diff presentation
- retention

Hard delete is permanent (rule #9); no history UI exists.

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
