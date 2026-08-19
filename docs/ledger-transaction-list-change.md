# Ledger — Transaction List UI & Architecture Change Note

**Purpose:** Standalone implementation change note for Claude Code.

**Important:** This supplements the existing v9 documentation. Do not rewrite or renumber v9 docs because of this note. Treat this file as current implementation guidance for the transaction-list UI and related changes.

## 1. Decision

Make **TransactionList** a reusable first-class UI component.

Contexts:
1. Member view — all transactions for active member.
2. Account view — transactions involving a specific account.
3. Space view — later; transactions attached to a Space.

Accounting model does not change. Transaction remains financial fact; postings remain accounting spine.

## 2. Table technology

Use **TanStack Table** for transaction grid.

TanStack Table is presentation/interactions layer only. It may provide sorting, filtering, row selection, pagination, column visibility, editable cells, table state, and later virtualization.

**Never allow table cells to write directly to SQLite.**

Mutation flow:

```text
UI cell edit
    ↓
Transaction mutation command/service
    ↓
load complete transaction
    ↓
apply requested change
    ↓
validate complete transaction
    ↓
persist atomically
```

Table must never become accounting engine.

## 3. Transaction row model

UI represents **one Transaction as one logical row**. A transaction may contain multiple postings.

Example:

```text
13 Aug | Ginza Dinner | HDFC Bank | ₹5,000
                              ├── EatingOut    ₹2,500
                              └── Receivables  ₹2,500
```

Do not flatten a multi-posting transaction into unrelated transaction rows.

Simple:

```text
HDFC Bank → EatingOut       ₹2,500
```

Split:

```text
HDFC Bank → EatingOut       ₹2,500
          → Receivables     ₹2,500
```

Underlying transaction remains N-posting double-entry data.

## 4. Recommended columns

Primary grid:

```text
Date
Description
Tags
From Account
From Amount
Direction / connector
To Account
To Amount
Actions
```

Exact visual treatment may evolve.

Inline editing is suitable for Date, Description, Tags, Account selection, and Amount where the resulting transaction can be validated.

Complex posting changes should open the transaction editor rather than allowing arbitrary posting manipulation inside cells.

## 5. Transaction scopes

Use one reusable component with query scope.

```tsx
<TransactionList scope="member" />
```

```tsx
<TransactionList scope="account" accountId="..." />
```

Future:

```tsx
<TransactionList scope="space" spaceId="..." />
```

### Member scope

```text
member_id = activeMemberId
```

### Account scope

```text
transaction.member_id = activeMemberId
AND transaction has posting.account_id = selectedAccountId
```

Do not create a second transaction model for Account pages.

### Space scope

Deferred until Spaces are implemented.

Space is transaction/context filter, not separate accounting ledger.

## 6. Account page

Reuse TransactionList:

```text
Account Detail
────────────────────────────
HDFC Bank          ₹xxx

Transactions | Settings
────────────────────────────

<TransactionList
    scope="account"
    accountId="hdfc-bank"
/>
```

Do not build `AccountTransactionTable`.

## 7. Member isolation

Every transaction query must be member-scoped by default.

A caller must not retrieve another member's data by supplying an account or transaction ID.

Pattern:

```text
activeMemberId
    ↓
query scope
    ↓
validate requested entity belongs to member
    ↓
execute query
```

For Account scope:

```text
account.member_id == activeMemberId
```

For transaction mutations, validate complete transaction and all referenced accounts belong to same member.

Do not rely solely on UI state.

## 8. Editing rules

Grid is editable, but editing is **transaction-level accounting mutation**.

Description:

```text
Grid → updateTransactionDescription() → persist
```

Amount:

```text
Grid
 ↓
updateTransactionAmount()
 ↓
load complete transaction
 ↓
recalculate / validate postings
 ↓
ensure balanced
 ↓
atomic persist
```

Account:

```text
Grid
 ↓
updateTransactionPostingAccount()
 ↓
validate account ownership
 ↓
validate transaction
 ↓
atomic persist
```

Tags remain inline on transaction record. No normalized tag table.

Current MVP model:

```ts
Record<string, string>
```

Account tags remain on Account. Transaction tags remain on Transaction. Tag edit affects only that record.

## 9. Split / multi-posting UI

MVP supports:

### Simple mode

```text
source → destination
```

### Split mode

Primary consumer use case:

```text
one source → many destinations
```

Example:

```text
HDFC Bank ₹5,000

EatingOut       ₹2,500
Receivables     ₹2,500
```

Domain remains generic N-posting.

Do not weaken domain model because MVP UI exposes simplified split workflow. Complex many-to-one or many-to-many editing can remain in advanced transaction editor.

## 10. Database implications

### No new core entities

This change does **not** require:

- TransactionList table
- AccountTransaction table
- normalized Tag table
- posting-view persistence
- duplicate transaction records

Existing:

```text
Member
Currency
Account
Transaction
Posting
```

remain source of truth.

### Query considerations

Account-scoped queries will commonly join:

```text
transactions
    → postings
    → accounts
```

or use equivalent `EXISTS`.

Ensure appropriate indexes for common access paths, especially:

```text
transactions.member_id
postings.transaction_id
postings.account_id
```

If equivalent indexes already exist, do not add duplicates.

Do not introduce a materialized transaction-list table. The list is a projection/query over the ledger.

## 11. Domain invariants remain unchanged

Every table mutation must preserve existing ledger rules:

```text
transaction belongs to one member
transaction has valid postings
transaction has at least two postings
posting references account owned by transaction member
posting has valid debit/credit side
transaction remains balanced
currency rules remain valid
```

Hard delete remains hard delete.

No history/audit implementation is introduced by this change.

## 12. Component structure

Suggested:

```text
TransactionList
├── TransactionToolbar
├── TransactionFilters
├── TransactionTable
│   └── TransactionRow
│       ├── DateCell
│       ├── DescriptionCell
│       ├── TagsCell
│       ├── PostingSummary
│       └── ActionsCell
└── Pagination
```

Application/domain layer:

```text
TransactionList
    ↓
transaction query hooks/services
    ↓
repositories / application services
    ↓
domain validation
    ↓
SQLite
```

Do not put accounting rules inside React components, TanStack column definitions, cell renderers, or table callbacks.

## 13. Suggested implementation order

### Step 1 — Read-only list

- reusable TransactionList
- member scope
- account scope
- pagination
- basic sorting
- basic filtering

### Step 2 — Transaction row rendering

- 1-to-1
- 1-to-many
- tags
- account names
- amounts
- actions

### Step 3 — Inline editing

- description
- date
- tags
- account
- amount

Every mutation goes through transaction services.

### Step 4 — Transaction editor

- full posting structure
- split mode
- complex changes
- validation feedback

### Step 5 — Account page reuse

Use same TransactionList with `scope="account"`.

### Step 6 — Later Space integration

Do not implement now. Add `scope="space"` only when Spaces become active.

## 14. Non-goals

This change does **not** introduce:

- transaction history
- audit/version tables
- imports
- email ingestion
- synchronization
- sharing
- Spaces
- investments
- multi-currency MVP support
- normalized tags
- merchant entity
- recurring transactions
- budgeting

Do not expand implementation scope because these may eventually use TransactionList.

## 15. UX direction from FinBodhi reference

FinBodhi demonstrates a useful pattern:

```text
Track → Transactions
```

and:

```text
Track → Accounts → HDFC Bank
```

both use essentially the same transaction representation, with Account page narrowing transaction scope.

Carry this reuse into Ledger.

Do not copy FinBodhi's implementation or accounting model blindly.

Useful design principle:

> **One transaction list. Multiple contexts.**

Ledger's double-entry model remains authoritative.

## 16. Acceptance criteria

- [ ] Member transaction page uses reusable TransactionList.
- [ ] Account detail page uses same TransactionList.
- [ ] Account scope only returns transactions involving that account.
- [ ] All queries remain member-scoped.
- [ ] 1-to-1 transactions render cleanly.
- [ ] 1-to-many transactions render as one transaction with multiple destinations.
- [ ] TanStack Table handles table state/interactions.
- [ ] Inline edits go through application/domain services.
- [ ] No UI path writes directly to database.
- [ ] Amount/account edits preserve ledger invariants.
- [ ] Tags remain inline `Record<string,string>`.
- [ ] No new tag entity/table.
- [ ] No duplicate transaction/account-specific transaction model.
- [ ] Hard delete remains deletion behaviour.
- [ ] No history/audit implementation.
- [ ] Existing v9 domain/accounting decisions remain intact.

## 17. Implementation principle

The table is a **view and interaction surface**.

The ledger is the **source of truth**.

```text
                ┌─────────────────────┐
                │   TransactionList   │
                │   TanStack Table    │
                └──────────┬──────────┘
                           │
                  query / mutation
                           │
                           ▼
                ┌─────────────────────┐
                │ Application Services│
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │   Domain / Ledger   │
                │  validation/rules   │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │       SQLite        │
                └─────────────────────┘
```

**Do not optimize the database model around the table. Optimize the table around the ledger.**
