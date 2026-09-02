# MVP Scope

## Included

### Core

- AppUser identity / Profile (financial identity)
- Currency
- Account
- Transaction
- Posting
- double-entry validation
- explicit transaction ownership
- INR-only currency model

### Accounts

- create/edit/archive
- classification
- MVP instrument type
- currency
- inline account tags
- account balance

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

### Transactions

- create/edit
- hard delete
- income
- expense
- transfer
- multi-posting transactions
- transaction tags
- date
- description
- filtering/search

### Transaction entry

Two modes:

1. Simple mode — standard two-leg transaction.
2. Split mode — multi-posting transaction.

Simple mode example:

```text
From: HDFC Credit Card
Amount: ₹5,000
To: Food
```

Split mode example:

```text
From: HDFC Credit Card
Amount: ₹5,000

Food         ₹2,000
Receivable   ₹3,000
```

The UI does not expose debit/credit terminology to ordinary users.

### Accounting

- debit/credit
- balance validation
- minimum two postings
- posting-side validation
- opening balances
- account balances
- atomic posting
- integer minor-unit money storage
- Profile ownership validation
- INR-only validation

### Identity

- AppUser registration/login (real authentication)
- each AppUser linked to exactly one Profile; a Profile can also exist unlinked
- Primary User (first AppUser) can create/access additional Profiles via `/profiles`
- Profile-scoped Accounts, Transactions and Currencies

### Imports

- statement upload (generic CSV, HDFC Bank Account XLS, Axis Bank Account XLS, IDFC FIRST Bank Account XLS, Federal Bank Account PDF (password-protected))
- adapter auto-detection, account resolution (exact/possible-match/ambiguous/new)
- editable preview, explicit approval, atomic commit
- permanent `import_file_id` provenance on committed Transactions
- Rules and Duplicate Detection remain deferred plugins (not built)

### Recurring Transactions

- Recurring Rule definition (Name, From/To Account, Amount, Description, Schedule) — not a Transaction
- Daily/Weekly/Monthly/Yearly schedules, Start date, optional End date
- `+ Add New` (blank) and `Make recurring` on a transaction row (prefilled) — one shared form
- Recurring page: Rules list (Name/Next Due/Schedule/Amount, Edit/Delete) and Calendar view
- No automatic transaction generation, transaction matching, or reminders (Phase 1)

### Budgets

- One-time and Recurring Budgets, Expense-only (Assets/Liabilities/Income/Equity/Savings out of scope)
- Scope: explicit Expense Accounts and/or a Budget-domain condition filter (Expense Account/Date/Tags/Description), union'd
- Budget Allocations (target per Expense Account); parent total always derived, never independently editable
- Recurring Budget Periods require explicit "Review & Create" approval — never created silently; each approved Period freezes its own scope snapshot as permanent history
- Actuals are never persisted — always summed at read time from `postings`
- No Goals, Plans, envelope budgeting, savings budgets, or FX conversion engine (deferred)

### Tags

- inline `string[]` on Accounts
- inline `string[]` on Transactions
- tag chips
- tag search/filter
- per-record tag editing
- no global Tag entity

### UI

- dashboard
- accounts
- transaction list
- transaction entry/edit
- simple/split transaction modes
- filters/search
- basic reports

## Explicitly excluded

```text
Spaces
Expense sharing
Settlements
Import Rules / Duplicate Detection plugins
Import adapters beyond the five shipped (generic CSV, HDFC/Axis/IDFC FIRST/Federal Bank Account XLS/PDF)
SMS / Email statement import
Automatic transaction generation from Recurring Rules
Recurring Rule transaction-matching / reminders
Multi-currency
FX
Investment valuation/pricing/quantity
Transaction history
AI
Cloud sync
```

## Scope principle

Build a working manual ledger first. Do not implement deferred modules prematurely.
