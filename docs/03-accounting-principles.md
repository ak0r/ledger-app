# Accounting Principles

## Double-entry

Every persisted Transaction balances:

```text
Total Debits = Total Credits
```

## Transaction invariant

Every persisted Transaction:

1. belongs to exactly one Profile
2. has at least two Postings
3. is complete
4. is balanced

## Posting invariant

Each Posting:

- belongs to exactly one Transaction
- references exactly one Account
- has non-negative debit and credit
- has exactly one positive side
- cannot have both debit and credit positive
- cannot have both zero

## Ownership

Each Account belongs to exactly one Profile.

Each Transaction belongs to exactly one Profile.

Every Posting Account must belong to the same Profile as its Transaction.

No shared Accounts.

## Currency

Each Account references exactly one Currency, drawn from the system
Currency Catalogue (`docs/04-modules.md`). A Profile has a Primary
Currency (default for new Accounts, changeable, not retroactive); an
Account's own Currency is independently changeable and authoritative.

Posting currency is derived from Account.

No cross-currency Transactions or FX — a Transaction whose postings
resolve to more than one currency is rejected
(`MIXED_CURRENCY_UNSUPPORTED`), except the one Currency Conversion shape.

## Classification

```text
ASSET
LIABILITY
INCOME
EXPENSE
BALANCING
```

Classification determines accounting meaning.

Instrument type does not determine accounting treatment.

## Transfers

Transfers move value between Accounts and do not create Income/Expense.

## Credit cards

Purchase:

```text
Expense       DEBIT
Credit Card   CREDIT
```

Payment:

```text
Credit Card   DEBIT
Bank          CREDIT
```

Payment is not another Expense.

## Opening balances

Opening balances use a Balancing Account.

## Money

Use integer minor units.

Never use floating-point money.

Currency defines minor-unit scale.

## Atomicity

Transaction creation, editing and deletion are atomic.

Create/edit must not leave partially updated Transactions or Postings.

Delete removes the Transaction aggregate and dependent records atomically.

## Deletion

Hard delete (rule #9).

No soft-delete fields.

No transaction history (deferred).

## Drafts

Drafts exist only in transient UI/application state.

No persisted draft status.

## Tags

Tags are inline metadata only.

Changing tags never changes:

- balances
- postings
- account classification
- transaction accounting

## Investments

Investment quantity, valuation, and pricing live in the separate Portfolio
domain (`docs/02-domain-model.md`, `docs/04-modules.md`) — never a Ledger
Account, Transaction, or Posting. Cost basis and capital-gains tax
computation remain deferred.
