# Domain Model

## Core entities

MVP:

- Profile
- Currency
- Account
- Transaction
- Posting

No separate accounting Category entity. Expense categories are Expense Accounts. Income categories are Income Accounts.

## Profile

Renamed from "Member" (2026-08-20 User Simplification delta — see
`docs/completed/2026-08-20-User-Simplification.md` for the full identity
model). Represents one financial identity within the Hosted Instance.

- a Profile is a financial identity, independent of authentication
- each AppUser (real login/session) is linked to exactly one Profile
- a Profile can also exist unlinked to any AppUser (created by the Primary
  User for someone who registers later)
- Accounts, Transactions and Currencies are Profile-scoped

Example:

```text
Hosted Instance
├── AppUser (amit@example.com) ──1:1── Profile "Amit"
│                                        ├── Accounts
│                                        ├── Transactions
│                                        └── Currency
└── Profile "Partner" (unlinked)
    ├── Accounts
    ├── Transactions
    └── Currency
```

No shared Accounts.

## Currency

Currency is a Profile-scoped reference.

MVP supports INR only.

Each Account references exactly one Currency.

```text
INR
├── code = INR
├── symbol = ₹
└── minor_unit_scale = 2
```

Currency owns monetary precision. Account owns the relationship to Currency.

Posting does not carry a separate currency field. Posting currency is derived from its Account.

Future multi-currency / FX may introduce additional currencies and FX mechanics.

## Account

Every Account belongs to exactly one Profile and exactly one Currency.

Fields/concepts:

- id
- name
- profile
- classification
- instrument type
- optional instrument ID
- optional instrument label
- currency
- inline account tags
- archive state
- metadata

### Classification

Classification defines accounting meaning:

```text
ASSET
LIABILITY
INCOME
EXPENSE
BALANCING
```

`BALANCING` replaces user-facing `EQUITY` because Equity can be confused with equity investments/stocks.

`BALANCING` serves technical accounting purposes such as opening balances and adjustments.

### Instrument type

Instrument type describes the nature of the Account/instrument. It does not determine accounting treatment.

MVP (frozen — AGENTS.md rule #11, 2026-08-19 account-model delta):

```text
BANK
CASH
CREDIT_CARD
LOAN
EXPENSE
INCOME
BALANCING
MUTUAL_FUND
STOCK
COMMODITY
```

`MUTUAL_FUND`/`STOCK`/`COMMODITY` are instrument-backed (see the separate
Instrument entity below) but full investment mechanics — quantity, pricing,
valuation — are still not built (Step 1 of 10 shipped; see
`docs/pending/2026-08-21-Instrument-Model-Pricing-Foundations.md`).

Future (not yet a frozen type):

```text
ETF
```

Examples:

```text
HDFC Bank
classification = ASSET
instrument_type = BANK
```

```text
HDFC Credit Card
classification = LIABILITY
instrument_type = CREDIT_CARD
```

```text
Home Loan
classification = LIABILITY
instrument_type = LOAN
```

```text
Food
classification = EXPENSE
instrument_type = EXPENSE
```

```text
Salary
classification = INCOME
instrument_type = INCOME
```

`STOCK`/`MUTUAL_FUND`/`COMMODITY` Accounts exist as a frozen instrument type
(above), but full investment mechanics remain future work — see the note
above.

### Instrument identifiers

`instrument_id` and `instrument_label` on `accounts` are nullable free-text
fields (ADR-016) — unrelated to the separate `Instrument` catalogue entity
(shared reference data, not Profile-scoped — one row per real-world
instrument like "HDFC Bank the stock") or to `AccountIdentifier` (a bank
statement's account-number identifier, used by Import account resolution —
see `docs/04-modules.md`'s Imports section). Examples of the free-text
fields:

```text
Stock:
instrument_id = INE118H01025
instrument_label = BSE Limited
```

```text
Commodity:
instrument_id = gold-999
instrument_label = Gold 999
```

Investment valuation, quantity, cost basis, and tax rules are still not implemented.

## Transaction

Transaction is the user/domain representation of a financial event.

A Transaction belongs to exactly one Profile.

A Transaction contains at least two Postings.

Every Posting must reference an Account owned by the Transaction's Profile.

MVP supports INR only. Cross-currency Transactions are not supported.

Fields/concepts:

```text
id
profile_id
date
description
tags
import_file_id
created_at
updated_at
```

`import_file_id` is nullable — set only for Transactions created by the
Import workflow (see `docs/04-modules.md`), permanent provenance back to
the originating `ImportFile` even after commit.

No merchant entity in MVP. Description/payee remains text.

## Posting

Posting is one accounting leg of a Transaction.

Conceptually:

```text
Posting
├── id
├── transaction_id
├── account_id
├── debit
└── credit
```

Posting rules:

```text
debit >= 0
credit >= 0

exactly one of debit/credit > 0
```

Therefore:

```text
debit = 5000, credit = 0     VALID
debit = 0, credit = 5000     VALID
debit = 0, credit = 0        INVALID
debit = 5000, credit = 5000  INVALID
```

## Double-entry invariant

Every persisted Transaction must satisfy:

```text
SUM(debit) == SUM(credit)
```

and:

```text
COUNT(postings) >= 2
```

No partially posted or unbalanced Transaction.

## Ownership invariant

```text
transaction.profile_id
    ==
posting.account.profile_id
```

All Accounts referenced by a Transaction must belong to the same Profile as the Transaction.

## Examples

Expense:

```text
Food Expense       DEBIT   ₹2,000
HDFC Bank          CREDIT  ₹2,000
```

Income:

```text
HDFC Bank          DEBIT   ₹100,000
Salary Income      CREDIT  ₹100,000
```

Transfer:

```text
ICICI Bank         DEBIT   ₹20,000
HDFC Bank          CREDIT  ₹20,000
```

Credit-card purchase:

```text
Food Expense       DEBIT   ₹5,000
Credit Card        CREDIT  ₹5,000
```

Credit-card payment:

```text
Credit Card        DEBIT   ₹5,000
Bank               CREDIT  ₹5,000
```

Payment is not another expense.

Split expense:

```text
Food Expense       DEBIT   ₹2,000
Receivable         DEBIT   ₹3,000
Credit Card        CREDIT  ₹5,000
```

## Opening balance

Opening balance uses a Balancing Account:

```text
HDFC Bank          DEBIT   ₹250,000
Opening Balance    CREDIT  ₹250,000
```

## Money representation

Store money as integer minor units.

Never use floating-point values for money.

MVP INR scale:

```text
₹500.25 → 50025
```

Currency owns the scale.

## Tags

Tags are a flat list of opaque, user-defined strings (product-polish pass,
superseding the earlier key/value shape below).

Type:

```ts
type Tags = string[];
```

Account and Transaction each have their own independent `tags` field.

Example Account:

```json
["travel", "salary"]
```

Example Transaction:

```json
["Japan2026", "UPILite", "Dinner"]
```

Tag semantics:

- opaque strings, no key/value structure, not typed, not hierarchical
- multiple tags per record
- tags belong to the record, not to a global Tag entity
- changing one record's tags changes only that record
- tags do not affect accounting

UI can display tags as chips and support filtering/search by tag.

## Account Tags vs Transaction Tags

Separate semantics through ownership of the JSON field.

Account tags describe Accounts.

Transaction tags describe Transactions.

No shared tag table.

## Deletion

MVP uses hard delete.

Deleting a Transaction removes:

- Transaction
- its Postings
- dependent transaction-level data such as tags

Deletion is atomic.

No transaction history UI in MVP.

## Drafts

Drafts are transient UI/application state.

No persisted `DRAFT` status.

A persisted Transaction is complete and balanced.

## Future modules

### Spaces

Spaces provide context such as Japan 2026 or Home.

Types:

```text
PERSONAL
SHARED
```

Deferred.

### Expense Sharing

Separate from accounting splits.

Deferred.

### Imports

No longer deferred — see `docs/04-modules.md` for the shipped
adapter/account-resolution/atomic-commit architecture. Rules and Duplicate
Detection remain future plugin modules.

### Investments

Future instrument-aware module.

Deferred.
