# Changelog

All notable user-facing changes to Ledger are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries
are feature-level summaries of what Ledger does today — no file lists, no
code diffs, no commit-level or bug-hunt detail. Nothing is tagged/released
yet, so `[Unreleased]` reflects current shipped state rather than a
chronological session log; superseded work (e.g. the earlier per-Family
database architecture, later replaced by AppUser/Profile) isn't listed
separately. For architecture decision history, see `V5-CHANGELOG.md`
through `V8-CHANGELOG.md` and `docs/07-decisions.md`.

Versioning follows [Semantic Versioning](https://semver.org/) once the first
release is tagged. Until then, all work accumulates under `[Unreleased]`.

## [Unreleased]

### Identity & Profiles

- Real AppUser authentication (register/login/session). Each AppUser links
  to exactly one Profile (financial identity); a Profile can also exist
  unlinked. The Primary User (first AppUser registered on this instance)
  can create and switch between additional Profiles from Settings.
- The active Profile is app-level context resolved from a cookie, not a
  URL segment — routes are flat and top-level (`/accounts`,
  `/transactions`, `/imports`, `/recurring`, `/settings/...`).

### Accounts

- Create, edit, archive. Classification (Asset/Liability/Income/Expense/
  Balancing) and a frozen MVP instrument type per account, INR currency,
  inline tags, computed balance.
- Account Detail page: Transactions/History/Settings tabs, a monthly
  cashflow chart and a balance-trend chart, filtering and pagination.
- Bulk actions (archive, tag) and a filter drawer/quick search on the
  Accounts list.

### Transactions

- Simple mode (one From, one To) and Split mode (one From, many To) with a
  live balance indicator — progressive disclosure over one generic
  N-posting model, no debit/credit terminology shown to the user.
- Full edit (atomic replace) and hard delete; merge two eligible
  transactions into one.
- Filters (date range, account, classification, tag) and bulk actions
  (delete, tag) on the Transactions list.
- Quick Edit inline row and a full Edit/Split Sheet overlay. Split
  transactions collapse to one row by default with a disclosure chevron,
  consistent between desktop and mobile.

### Currency & Multi-Currency

- A system-maintained Currency Catalogue replaces the earlier INR-only
  freeze — a Profile has a Primary Currency (default for new Accounts,
  changeable, not retroactive) and each Account has its own independently
  changeable Currency. `/settings/currencies` adds a Currency to a Profile
  from the catalogue.
- Still no FX, conversion, or cross-currency aggregation — a Transaction
  whose postings resolve to more than one currency is rejected, except a
  dedicated 2-posting Currency Conversion shape that persists an explicit
  exchange rate for that one transaction.

### Settings & Backup

- `/settings` groups Profiles, Currencies, and Backups.
- Local whole-instance backup (the single `ledger.db` file), automatic
  daily backup with an on/off toggle, backup history.

### Recurring Transactions (Phase 1)

- Recurring Rules: define a recurring transaction pattern (From/To
  Account, Amount, Description) on a schedule (Daily/Weekly/Monthly/
  Yearly, Start date, optional End date) from a new **Recurring** page.
  Two entry points share one form: **+ Add New** (blank), or **Make
  recurring** on a transaction row (prefilled from that transaction — the
  two stay independent afterward).
- Recurring page has two views over the same rules: **Rules** (Name/Next
  Due/Schedule/Amount, Edit/Delete) and **Calendar** (a month grid of
  occurrences).
- Definition-and-display only — creating a rule never creates a
  Transaction. Automatic generation, transaction matching, and reminders
  are explicitly deferred.

### Budgets

- One-time and Recurring Budgets on a new **Budgets** page — track Expense
  activity only (never Income/Assets/Liabilities/savings). Scope is an
  explicit set of Expense Accounts and/or a condition filter (Expense
  Account/Date/Tags/Description, Match All/Any/None), unioned together.
- Budget Allocations set a target per Expense Account; the Budget total is
  always derived, never independently editable. An account with real
  spend but no target still shows up rather than getting an invented one.
- Actual spending is never stored — always summed live from Ledger
  transactions against the relevant period's own frozen scope.
- A Recurring Budget's next period is never created silently: a "Review &
  Create" step shows the upcoming date range with the previous period's
  targets as editable defaults. Once approved, that period's configuration
  is permanent history — later edits to the Budget only ever affect its
  current period, not past ones.
- The Budgets page and Home dashboard surface periods that have ended or
  are ending soon with a one-click Review action, without ever creating
  anything automatically.

### Dashboard and Panels

- The Home page is now a configurable Dashboard instead of a fixed
  layout. Every Profile gets a Starter Dashboard automatically: Net
  Worth/Assets/Liabilities cards, and Balances/Recent Expenses/Recent
  Transactions lists.
- **+ Add Panel** opens a catalogue grouped by Cards/Lists — a 7th panel,
  Budgets Needing Review, carries over the previous "needs review" card
  as a real panel. Panels can be moved via drag-and-drop on a fixed-size
  grid, configured (Balances: all accounts or a specific selection, never
  silently defaulted; Recent Expenses: a time period; Recent
  Transactions: how many to show), and removed instantly (no
  confirmation — nothing about the Ledger itself is affected).
- Panels never store balances, totals, or transaction results — every
  number is summed live from Ledger data on each view, same posture as
  Budgets' own actuals.
- An empty panel (no accounts selected, nothing to show) stays visible
  with an explanatory message rather than disappearing.

### Imports

- Upload a bank/card statement (generic CSV, HDFC/Axis/IDFC FIRST Bank
  Account XLS, Federal Bank Account PDF with password support) — adapter
  auto-detected, all parsing local/offline.
- Account resolution (exact match, possible masked-suffix match,
  ambiguous-requires-user-resolution, or propose a new account) for both
  the source account and every counterparty.
- Fully editable preview before commit; nothing is written to the Ledger
  until explicit approval, then commit is atomic. Committed transactions
  carry permanent import provenance, and import history shows resolved
  account, new-account count, and inflow/outflow per file.

### Portfolio (investment tracking)

- A new **Portfolio** top-level nav section, separate from Ledger: an
  Instrument Catalogue (real Stock/Mutual Fund reference data, searchable),
  and Portfolio's own model — PortfolioAccount/Folio/InvestmentTransaction/
  Holding/NAVHistory — never a Ledger Account or Transaction.
- **Import Mutual Fund CAS** — upload a CAMS/KFin Consolidated Account
  Statement PDF; parsed entirely on this machine (never sent anywhere).
  Preview counts/warnings before commit; a statement whose PAN doesn't
  match the active Profile's registered PAN is rejected.
- **Import demat eCAS** — upload an NSDL/CDSL holdings-snapshot PDF for
  equities; the demat account is auto-detected from the file itself.
- **Import Stock Tradebook** — upload a broker's equity delivery CSV
  (Zerodha's format, or a generic header-matched fallback) into a chosen
  Portfolio Account/Folio.
- **Valuation** — Mutual Fund NAVs refresh from a public AMFI feed; Stock
  prices refresh from NSE with a Yahoo Finance fallback. Each Security's
  page shows XIRR and a "Snapshot only"/"Verified" integrity badge
  comparing its transaction history against the latest imported statement.
- Overview, Mutual Funds, and Stocks pages show holdings, invested amount,
  and current value; "Accounts / Folios" manages Portfolio Accounts and
  Folios directly. A new cross-domain **Import Center** page shows Ledger's
  and Portfolio's import history side by side.
- Capital-gains/tax computation is explicitly not built yet.

### Onboarding

- Registering the first AppUser on an instance lands on a "How would you
  like to start?" screen: seed realistic demo data, or start from scratch.
- "Clean Up Content" wipes a Profile's Accounts/Transactions/Currencies
  without deleting the Profile itself — the documented way to discard demo
  data or start over.

### Design

- Flexoki-based light/dark/system theming; responsive navigation (sidebar
  on desktop, bottom bar on mobile); accessible Select/Menu/Dialog/Sheet
  components throughout; WCAG AA-verified contrast.
