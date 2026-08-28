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
