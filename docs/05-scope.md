# Feature Scope

What Ledger actually does today, and what's explicitly deferred. Superseded
the earlier "MVP Scope" framing (2026-09-06) — the product has grown past a
minimum viable slice into a maintained set of modules; this doc now tracks
current scope, not a launch checklist. Full detail per module lives in
`docs/04-modules.md`; open/future design questions live in
`docs/10-open-decisions.md`.

## Shipped

### Core ledger

- AppUser identity / Profile (financial identity), real registration/login
- Currency Catalogue: multiple currencies per Profile, a Profile Primary
  Currency, an independently changeable Account Currency — no FX/
  conversion/cross-currency aggregation
- Account: create/edit/archive, classification, instrument type, currency,
  inline tags, computed balance
- Transaction: create/edit (atomic full replace)/hard delete, income/
  expense/transfer, multi-posting (Simple + Split entry modes), tags,
  filtering/search, merge
- Double-entry validation: balance check, minimum two postings,
  posting-side validation, opening balances (via a Balancing Account),
  atomic posting, integer minor-unit money, Profile ownership validation

### Imports (Ledger)

- Statement upload: generic CSV, HDFC/Axis/IDFC FIRST Bank Account XLS,
  Federal Bank Account PDF (password-protected), Google Pay Transactions PDF
  (per-row source account resolution, no owning account of its own)
- Possible-duplicate detection (reference/heuristic match, advisory only —
  no auto-exclude, no resolution workflow yet)
- Adapter auto-detection, account resolution (exact / possible-match /
  ambiguous / propose new), for both the source account and every
  counterparty
- Editable preview, explicit approval, atomic commit, permanent
  `import_file_id` provenance
- Rules (auto-categorization) and Duplicate Detection remain deferred
  plugin extension points — not built

### Recurring Transactions (Phase 1)

- Recurring Rule definition (Name, Transaction Template, Schedule) — never
  a Transaction itself
- Daily/Weekly/Monthly/Yearly schedules, structured columns (not RRULE)
- `+ Add New` and `Make recurring` (prefilled from an existing
  transaction) share one form
- Rules list + Calendar view
- No automatic transaction generation, transaction matching, or reminders
  (Phase 1 scope)

### Budgets

- One-time and Recurring Budgets, Expense-only
- Scope: explicit Expense Accounts and/or a Budget-domain condition filter
  (Expense Account/Date/Tags/Description), unioned
- Budget Allocations (target per Expense Account); total always derived
- Recurring Budget Periods require explicit "Review & Create" approval —
  never created silently; each approved Period freezes its own scope
  snapshot as permanent history
- Actuals never persisted — always summed at read time from postings
- No Goals, Plans, envelope budgeting, savings budgets, or an FX
  conversion engine for mixed-currency scopes (deferred)

### Dashboard and Panels

- The Homepage is the default Dashboard for the active Profile, a Starter
  Dashboard auto-created for every new Profile
- Panels persist identity/configuration/placement only — every number is
  always runtime-derived
- Add/configure/remove panels; drag-and-drop on a fixed-size Bento grid —
  no resizing, one layout per Profile
- No multiple Dashboards per Profile, Charts panels, or user-resizable
  panels (deferred)

### Settings, Backup & Data Management

- Local whole-instance backup (the single `ledger.db` file), automatic
  daily backup toggle
- Clean Up Content: wipe a Profile's Accounts/Transactions/Currencies
  without deleting the Profile

### Portfolio (investment tracking)

- Its own domain — PortfolioAccount/Folio/InvestmentTransaction/Holding/
  NAVHistory — never a Ledger Account/Transaction/Posting
- Import: Mutual Fund CAS PDF, demat eCAS PDF (equities only), Stock
  Tradebook CSV — all Upload → Preview → Approval → Commit
- Valuation: AMFI bulk NAV feed for Mutual Funds, NSE feed (Yahoo Finance
  fallback) for Stocks, XIRR, a cut-down Holding-integrity signal
- Capital-gains/tax computation, corporate-action replay, partial-history
  chaining, and demat-held Mutual Fund/Bond holdings remain deferred

### Tags

- Inline `string[]` on Accounts and Transactions, no global Tag entity,
  tag chips, search/filter, per-record editing

## Explicitly excluded / deferred

```text
Spaces
Expense sharing / settlements
Import Rules / Duplicate Detection plugins
Import adapters beyond the ones shipped
SMS / Email statement import
Automatic transaction generation from Recurring Rules; transaction matching/reminders
Budget Goals, Plans, envelope/savings budgeting, FX-aware Budget scopes
Multiple Dashboards per Profile, Charts panels, user-resizable panels
FX conversion / cross-currency aggregation (Currency Conversion's own persisted per-transaction rate is the one exception)
Portfolio: capital-gains/tax, corporate actions, partial-history chaining, demat-held MF/Bonds, automatic Folio-identity reconciliation
Transaction history (edit/delete audit trail)
AI
Cloud sync
```

## Scope principle

Build each module deep enough to be genuinely useful before starting the
next one. Do not implement a deferred module without an explicit
architecture decision (AGENTS.md rule #18).
