# Ledger — Delta Change v9

**Type:** Standalone architecture delta  
**Status:** Proposed / accepted changes from FinBodhi comparison  
**Purpose:** Apply only these changes to the current documentation and implementation context. Do not rewrite the existing v9 documentation set.

---

## 1. Family remains the database boundary

Keep the current Family architecture:

```text
Application
├── Family A → isolated dataset/database
└── Family B → isolated dataset/database
```

Family is:

- application-level dataset boundary
- family selector/switching context
- natural financial backup/export boundary

Family is **not**:

- accounting category
- reporting filter
- Space
- Member

Do not add `family_id` to every financial table merely to reproduce physical dataset isolation.

---

## 2. Freeze Member ownership invariant

This is the most important core-model clarification.

Inside one Family:

```text
Member
  ↓
Accounts
  ↓
Transactions
  ↓
Postings
```

### MVP invariant

Every Transaction must resolve to **exactly one Member** through its referenced Accounts/Postings.

Therefore:

```text
Transaction
  ├── Posting → Account → Member A
  └── Posting → Account → Member A
```

is valid.

But:

```text
Transaction
  ├── Posting → Account → Member A
  └── Posting → Account → Member B
```

is invalid in MVP.

Domain/application validation must reject cross-member transactions.

This keeps personal accounting separate from future shared-expense functionality.

---

## 3. Transaction persistence: generic Postings

Do not copy FinBodhi's persistence shape of:

```text
fromPostings[]
toPostings[]
```

FinBodhi's supplied transaction data uses separate `fromPostings` and `toPostings` collections.

Ledger should persist:

```text
Transaction
    ↓
Postings[]
```

A Posting represents one accounting leg.

Example:

```text
Ginza Dinner ₹5,000

HDFC Bank       CREDIT  5,000
Food            DEBIT   2,500
Receivables     DEBIT   2,500
```

`from` and `to` are UI concepts/projections.

They should not determine the core persistence model.

### Reason

Generic postings naturally support:

- normal two-leg transactions
- one-to-many splits
- future many-to-one/many-to-many accounting
- transfers
- settlements
- investment transactions

without changing the transaction schema.

The MVP UI can remain intentionally simpler.

---

## 4. Posting invariants

Freeze these as domain rules:

```text
Transaction must have at least 2 postings.

Each posting must represent one non-zero accounting side.

A posting cannot have both debit and credit.

A posting cannot have both debit and credit equal to zero.

Total debits must equal total credits.

All accounts referenced by a transaction must belong to the same Member.

All postings in an MVP transaction must use the same currency.
```

These rules are ledger integrity rules, not UI validation only.

---

## 5. Tags remain inline

Do **not** introduce normalized tag tables for MVP.

FinBodhi's supplied schema uses a normalized `tags` table plus a transaction/tag cross-reference. This is intentionally **not** being copied.

Ledger continues with inline tags:

```json
{
  "Trip": "Japan2026",
  "Payment": "UPILite"
}
```

on the relevant Account or Transaction record.

### Intentional MVP constraint

Tags are:

```text
Record<string, string>
```

Therefore one key has one value:

```text
Trip = Japan2026
```

but not:

```text
Trip = Japan2026
Trip = Tokyo2026
```

This limitation is deliberate for MVP.

### Behaviour

Changing:

```text
Trip = Japan2026
```

to:

```text
Trip = Japan2026-Spring
```

on one Transaction changes only that Transaction.

No shared tag identity exists.

### Do not add

```text
tags
transaction_tags
account_tags
tag_cross_ref
```

to the MVP relational model.

---

## 6. Account instruments: no Ledger-owned catalogue

Asset Accounts may reference external instruments.

Examples:

```text
Stock
Mutual Fund
Metal
Commodity
```

Account can retain:

```text
instrumentType
instrumentId
instrumentLabel
```

Example:

```text
Account
  name: BSE Ltd
  category: assets
  instrumentType: stock
  instrumentId: INE118H01025
  instrumentLabel: BSE Limited
```

### Important change

Do **not** create a Ledger-owned master `instrument_catalog` for MVP.

Instrument search should come from an external/reference provider.

Conceptually:

```text
External API
     ↓
Instrument lookup
     ↓
temporary/disposable cache
     ↓
Account creation
     ↓
store selected instrument identity
```

The cache is implementation/reference data, not a financial domain entity.

### Account remains the financial object

Do not introduce a separate investment/holding architecture merely because an external instrument exists.

---

## 7. Prices are external valuation data

FinBodhi's supplied `_prices.json` contains dated historical price series.

Use this as evidence that market price data has a different lifecycle from ledger transactions.

Ledger should maintain this separation:

```text
Transaction
    = financial fact

Account
    = financial/holding identity

External price
    = market/reference data

Valuation
    = derived view
```

Current or historical external prices must never mutate:

- Transactions
- Postings
- Account ledger balances

Price data may be cached later, but cache is not the accounting source of truth.

---

## 8. Currency invariant

MVP remains:

```text
INR only
```

Currency belongs to the Account.

Transaction currency is therefore derived from its Accounts/Postings.

MVP invariant:

```text
all Accounts in a Transaction
        ↓
same currency
```

Do not allow a transaction to balance:

```text
₹100 INR
=
¥100 JPY
```

simply because both are stored as the same numeric amount.

Multi-currency / FX remains outside MVP.

---

## 9. Imports remain separate from Transactions

Keep the existing pipeline:

```text
Raw source
    ↓
Import / Ops event
    ↓
Cleaned candidate
    ↓
Transaction
    ↓
Ledger fact
```

Important distinction:

```text
Import ≠ Transaction
```

An email, file, or imported source is operational provenance.

A Transaction is a financial fact.

Do not make imported data the ledger source of truth until it has passed the cleaning/validation boundary.

---

## 10. Hard delete remains MVP behaviour

Keep:

```text
hard delete
```

No soft-delete model.

No persisted transaction status such as:

```text
DRAFT
POSTED
DELETED
```

for MVP.

### Transaction deletion

Deleting a Transaction must atomically delete its Postings.

Conceptually:

```text
BEGIN
  delete postings
  delete transaction
COMMIT
```

or rollback everything.

Never leave orphaned Postings.

No audit/history UI is introduced by this delta.

---

## 11. Spaces remain separate

Space remains a future contextual/reporting module.

Example:

```text
Family
│
├── Accounts
├── Transactions
│
└── Space: Japan Trip 2026
```

A Transaction can eventually belong to a Space while remaining a normal ledger fact.

Space does not:

- own Accounts
- replace Members
- create a second ledger
- become a database boundary
- alter the accounting meaning of a Transaction

This preserves the earlier principle:

```text
Family = dataset boundary
Member = ownership boundary
Space = contextual/reporting boundary
```

---

# 12. FinBodhi lessons — adopt selectively

The backup comparison reinforces several existing Ledger decisions.

### Keep

```text
Account categories
Double-entry transactions
Postings
Account-linked currency
Instrument identity on asset accounts
External price/reference layer
Import provenance
```

### Do not copy

```text
fromPostings/toPostings persistence
normalized tag model
large feature-driven schema
investment-specific master-data architecture
```

Use FinBodhi as reference, not as schema template.

---

# 13. Suggested conceptual model after delta

```text
Application
│
├── Family A
│    │
│    ├── Member A
│    │    ├── Accounts
│    │    └── Transactions
│    │          └── Postings
│    │
│    └── Member B
│         ├── Accounts
│         └── Transactions
│
└── Family B
     └── isolated dataset
```

External reference layers:

```text
External Instrument APIs
        ↓
instrument lookup/cache
        ↓
Account.instrumentId


External Price APIs
        ↓
price cache
        ↓
valuation
```

Future contextual layer:

```text
Spaces
   ↓
selected Transactions
```

---

# 14. Database-level delta

Current relational core should remain approximately:

```text
members
currencies
accounts
transactions
postings
```

Do not add:

```text
families
```

inside the isolated Family database merely for cross-family identification.

Do not add:

```text
instruments
tags
transaction_tags
account_tags
prices
```

to MVP solely to model external/reference data.

External/cache persistence can be introduced independently when implementation requires it.

---

# 15. Implementation implications

### Transaction service

Must validate:

```text
posting count >= 2
posting validity
balanced debit/credit
same-member accounts
same-currency accounts
```

before commit.

### Account service

Must support:

```text
cash/bank/etc.
instrument-backed asset selection
external instrument lookup
account-owned currency
inline tags
```

### Transaction UI

Continue with:

```text
Simple mode
Split mode
```

Simple mode remains two-leg user experience.

Split mode remains:

```text
one source → many destinations
```

Persistence remains generic `Postings[]`.

### Transaction List

Continue using one reusable TransactionList.

Account pages and broader transaction views should project the same transaction model.

---

# 16. Explicit non-changes

This delta does **not** change:

- Family as isolated database boundary
- Member concept
- Account categories
- Account-owned currency
- INR-only MVP
- double-entry accounting
- inline tags
- hard delete
- no history in MVP
- Spaces as future module
- mobile-first UI
- explicit Edit mode for transaction list
- Simple/Split transaction UI
- shadcn semantic tokens
- Flexoki-inspired theme
- Light/Dark/System modes

---

# 17. Priority

Implementation priority from this delta:

```text
1. Freeze Transaction → Posting → Account → Member invariant
2. Freeze generic Postings[] persistence
3. Add same-currency invariant
4. Keep inline tags
5. Keep external instrument lookup without catalog
6. Keep price data outside ledger facts
7. Keep import/ops boundary
8. Keep hard-delete atomicity
```

---

# 18. Final architectural statement

> **Ledger owns financial facts. External systems provide reference data. Family isolates datasets. Member owns financial objects. Postings enforce accounting. Tags add lightweight context. Spaces provide future contextual views.**

This is the intended delta from the FinBodhi comparison.

Do not turn this delta into a broad rewrite of the existing documentation.
