# Accounting Principles

## Double-entry

Every persisted Transaction balances:

```text
SUM(base_amount) == 0
```

Every Posting's `base_amount` is its own `units` valued into the Profile's
Base Currency (ADR-047) — for a same-currency Transaction this is
numerically identical to the older "Total Debits = Total Credits."

## Transaction invariant

Every persisted Transaction:

1. belongs to exactly one Profile
2. has at least two Postings
3. is complete
4. is balanced

## Posting invariant

Each Posting (ADR-047 — replaces the old debit/credit-only shape):

- belongs to exactly one Transaction
- references exactly one Account
- has a nonzero signed `units` (the Account's own currency, minor units)
- has a positive `price_num` and `price_denom` (the rational valuation
  ratio into the Profile's Base Currency)
- has a `base_amount` derived from `units × price_num / price_denom`,
  rounded half-to-even — never independently entered

## Ownership

Each Account belongs to exactly one Profile.

Each Transaction belongs to exactly one Profile.

Every Posting Account must belong to the same Profile as its Transaction.

No shared Accounts.

## Currency

Each Account references exactly one Currency, drawn from the system
Currency Catalogue (`docs/04-modules.md`). A Profile has a Primary
Currency — also its Base Currency, the fixed reconciliation target every
Transaction's Postings value into (default for new Accounts, changeable,
not retroactive); an Account's own Currency is independently changeable
and authoritative.

Posting currency is derived from Account.

Any Posting may independently be priced in a currency other than the Base
Currency (ADR-047) — genuine N-leg cross-currency Transactions are
supported, not just one fixed 2-posting Conversion shape.
`MIXED_CURRENCY_UNSUPPORTED` is retired. A dated CurrencyRate (or an
explicit user-confirmed rate) resolves each such Posting's exact-rational
price; no FX aggregation beyond that, and an entry that doesn't reconcile
is rejected (`UNBALANCED`), never silently forced to balance.

## Classification

```text
ASSET
LIABILITY
INCOME
EXPENSE
BALANCING
```

Classification determines accounting meaning.

Account type (mandatory on every Classification, ADR-047) does not
determine accounting treatment — Classification does.

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
