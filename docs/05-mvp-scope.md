# MVP Scope

## Included

### Core
- Member/profile
- multiple local Members
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
- Member ownership validation
- INR-only validation

### Members
- create local Member
- multiple Members in one local installation
- active Member selection
- Member-scoped Accounts, Transactions and Currencies

No authentication.

### Tags
- inline key/value JSON on Accounts
- inline key/value JSON on Transactions
- tag chips
- tag key/value search/filter
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
Imports
SMS
Email
Statements
Multi-currency
FX
Investments
Stock accounts
Metal accounts
Budgets
Transaction history
AI
Authentication
Cloud sync
```

## Scope principle

Build a working manual ledger first. Do not implement deferred modules prematurely.
