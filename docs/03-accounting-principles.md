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

No shared Accounts in MVP.

## Currency

MVP supports INR only.

Each Account references exactly one Currency.

Posting currency is derived from Account.

No cross-currency Transactions or FX in MVP.

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

MVP uses hard delete.

No soft-delete fields.

No transaction history in MVP.

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

Investment-specific quantity, valuation, cost basis, tax and pricing mechanics are deferred.
