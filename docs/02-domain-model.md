# Domain Model

## Core entities

The accounting spine (`core/ledger`):

- Profile
- Currency
- Account
- Transaction
- Posting

No separate accounting Category entity. Expense categories are Expense Accounts. Income categories are Income Accounts.

Later modules add their own entities on top of this spine, documented in
`docs/04-modules.md` rather than repeated here: Recurring Rule, Budget/
BudgetPeriod/BudgetAllocation, Dashboard/DashboardPanel, CurrencyRate,
CreditCardDetails/LoanDetails. The Portfolio domain (`core/portfolio`) is
a deliberately separate sibling model —
PortfolioAccount/Folio/InvestmentTransaction/Holding/NAVHistory — see its
own section below.

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

Currency is a Profile-scoped reference, instantiated from the system-
maintained Currency Catalogue (`core/shared/currency.ts`, a code-level
constant, not a DB table — `docs/04-modules.md`).

Each Account references exactly one Currency. A Profile has a Primary
Currency — also its Base Currency, the fixed reconciliation target every
Transaction's Postings value into (default for a new Account, changeable,
not retroactive); an Account's own Currency is authoritative and
independently changeable — since Transactions never store a currency of
their own, changing an Account's Currency immediately reinterprets every
existing and future Transaction on it.

```text
INR
├── code = INR
├── symbol = ₹
└── minor_unit_scale = 2
```

Currency owns monetary precision. Account owns the relationship to Currency.

Posting does not carry a separate currency field. Posting currency is derived from its Account.

Any Posting may independently be priced in a currency other than the Base
Currency (ADR-047) — genuine N-leg cross-currency Transactions are
supported, not just one fixed 2-posting Conversion shape.
`MIXED_CURRENCY_UNSUPPORTED` is retired. A dated CurrencyRate (or an
explicit user-confirmed rate) resolves each such Posting's exact-rational
price into the Base Currency; still no FX aggregation beyond that.

## Account

Every Account belongs to exactly one Profile and exactly one Currency.

Fields/concepts:

- id
- name
- profile
- classification
- account type
- optional instrument ID (inert)
- optional instrument label (inert)
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

### Account type

Account type describes the nature of the Account within its Classification.
It does not itself determine accounting treatment — Classification does
that (see above); Account type is a mandatory, more specific categorisation
layered on top of it.

Mandatory on every Classification (AGENTS.md rule #30, ADR-047 —
supersedes the earlier frozen 7-value `instrument_type` taxonomy, rule
#11/ADR-024, and reverses rule #21's original "only Asset/Liability have
one" scope):

```text
ASSET       CASH, BANK, INVESTMENTS, WALLET, RECEIVABLES
LIABILITY   CREDIT_CARD, LOAN, PAYABLES
INCOME      EARNED, PASSIVE, WINDFALL
EXPENSE     FIXED, VARIABLE, DISCRETIONARY, FINANCIAL
BALANCING   INITIAL
```

`BALANCING`'s `INITIAL` is system-managed only — never offered as a
choice in the Account form (rule #22).

A Ledger Account can never be Instrument-backed (`MUTUAL_FUND`/`STOCK`/
`COMMODITY` were removed from this vocabulary by the earlier Ledger/
Portfolio delink, ADR-040 — an Asset Account's real types are the five
above). Investment tracking is a separate sibling domain, Portfolio, with
its own `InstrumentBackedType` list (`MUTUAL_FUND`/`STOCK`/`COMMODITY`)
and its own `PortfolioAccount` entity — see "Portfolio domain" below and
`docs/04-modules.md`.

Enforced by `UNIQUE(profile_id, classification, account_type, name)` — no
two Accounts in one Profile can share all three.

Examples:

```text
HDFC Bank
classification = ASSET
account_type = BANK
```

```text
HDFC Credit Card
classification = LIABILITY
account_type = CREDIT_CARD
```

```text
Home Loan
classification = LIABILITY
account_type = LOAN
```

```text
Food
classification = EXPENSE
account_type = VARIABLE
```

```text
Salary
classification = INCOME
account_type = EARNED
```

### Instrument identifiers (inert)

`instrument_id` and `instrument_label` still exist as nullable columns on
`accounts` (ADR-016), unaffected by ADR-047. Still threaded through
`CreateAccountInput`/`UpdateAccountInput` as a technicality (ADR-040 left
them inert rather than dropped), but nothing in the Account form has
populated a non-null value since the Ledger/Portfolio delink — no
Instrument picker exists there anymore. They were, and are, unrelated to
the separate `Instrument` catalogue entity (shared reference data, not
Profile-scoped —
one row per real-world instrument like "HDFC Bank the stock") or to
`AccountIdentifier` (a bank statement's account-number identifier, used by
Import account resolution — see `docs/04-modules.md`'s Imports section).

## Transaction

Transaction is the user/domain representation of a financial event.

A Transaction belongs to exactly one Profile.

A Transaction contains at least two Postings.

Every Posting must reference an Account owned by the Transaction's Profile.

Any Posting may independently be priced in a currency other than the
Profile's Base Currency (ADR-047) — genuine N-leg cross-currency
Transactions are domain-valid, not just one fixed 2-posting Conversion
shape. `MIXED_CURRENCY_UNSUPPORTED` is retired; the real invariant is the
Double-entry invariant below (`SUM(base_amount) == 0`), which every
Posting's price resolution feeds into.

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

No merchant entity. Description/payee remains text.

## Posting

Posting is one accounting leg of a Transaction.

Conceptually (ADR-047 — replaces the old `debit`/`credit`/`quantity`/
`price` shape outright, not alongside it):

```text
Posting
├── id
├── transaction_id
├── account_id
├── units        (signed integer minor units, Account's own Currency)
├── price_num    (positive integer)
├── price_denom  (positive integer)
└── base_amount  (signed integer minor units, Profile's Base Currency)
```

`units` is signed: an Asset Account receiving money is positive, paying
money out is negative (`units = debit - credit` under the old model).
`price_num`/`price_denom` is the exact rational valuation ratio converting
`units` into the Profile's Base Currency's minor units — always `1/1` for
a Posting whose Account already uses the Base Currency, otherwise the
resolved CurrencyRate (or an explicit user-confirmed rate) for that
Transaction's own date. `base_amount = round_half_even(units × price_num
/ price_denom)` — computed via checked BigInt arithmetic
(`core/shared/rational.ts`), never a float, never `Math.round`.

Posting rules:

```text
units != 0
price_num > 0
price_denom > 0
```

Therefore:

```text
units = 5000                          VALID  (a debit-side leg)
units = -5000                         VALID  (a credit-side leg)
units = 0                             INVALID
price_num = 0 or price_denom = 0      INVALID
```

## Double-entry invariant

Every persisted Transaction must satisfy:

```text
SUM(base_amount) == 0
```

and:

```text
COUNT(postings) >= 2
```

No partially posted or unbalanced Transaction. `SUM(base_amount) == 0`
generalises the older `SUM(debit) == SUM(credit)` — for a same-currency
Transaction (every leg's price is `1/1`) the two are numerically
identical; the residual-ownership rounding rule (ADR-047) guarantees the
sum is exactly zero by construction even across genuine multi-currency
legs, never off by a rounding unit.

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

Example (INR, scale 2):

```text
₹500.25 → 50025
```

Currency owns the scale.

A rational exchange rate (Posting's `price_num`/`price_denom`, CurrencyRate's
`rate_num`/`rate_denom`) follows the same never-float rule — GCD-reduced
integers, never a stored decimal or `REAL` column (ADR-047).

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

Hard delete (rule #9).

Deleting a Transaction removes:

- Transaction
- its Postings
- dependent transaction-level data such as tags

Deletion is atomic.

No transaction history UI (deferred — `docs/10-open-decisions.md`).

## Drafts

Drafts are transient UI/application state.

No persisted `DRAFT` status.

A persisted Transaction is complete and balanced.

## Portfolio domain

A deliberately separate sibling model (`core/portfolio`, ADR-040/041) —
never a Ledger Account, Transaction, or Posting. Full detail in
`docs/04-modules.md`'s Investments section; entities only, here:

```text
PortfolioAccount   (a brokerage/AMC/demat relationship — "Zerodha", "CAMS")
Folio              (an account/folio number within a PortfolioAccount)
Instrument         (shared catalogue reference data, not Profile-scoped —
                     MUTUAL_FUND | STOCK | COMMODITY, "HDFC Bank the stock")
InvestmentTransaction  (BUY/SELL/DIVIDEND/BONUS/SPLIT/TRANSFER_IN/OUT —
                         units × price == amount, the single-sided
                         equivalent of a Ledger posting's balance check)
Holding            (an *observed* snapshot from an import — CAS/eCAS
                     closing balance, never the live computed position)
NAVHistory         (per-Instrument price history, not Profile-scoped)
PortfolioImport    (CAS / ECAS / CSV / MANUAL import provenance)
```

The live position is always netted fresh from `InvestmentTransaction`
rows (`netUnitsFromTransactions`) — never read from `Holding`, mirroring
how a Ledger Account's balance is always summed fresh from `postings`.

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

Shipped as the Portfolio domain — see "Portfolio domain" above and
`docs/04-modules.md`. Capital-gains/tax computation remains deferred.
