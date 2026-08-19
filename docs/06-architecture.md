# Technical Architecture

## Stack

- Next.js
- React
- TypeScript
- App Router
- shadcn/ui
- Tailwind CSS
- TanStack Table
- React Hook Form
- Zod
- SQLite
- Drizzle ORM
- Node.js

Initial deployment: local machine.

Later:
- Docker Compose
- Tailscale
- Traefik if required

No cloud dependency for MVP.

## Architecture

```text
Browser
   ↓
Next.js
   ↓
Application / Domain
   ↓
Ledger Core
   ↓
Drizzle
   ↓
SQLite
```

## Domain boundary

Core accounting code must not depend on:
- React/UI
- import parsers
- email/SMS APIs
- AI providers
- Spaces
- expense-sharing logic

## API

No separate REST API required for MVP.

## Validation

Zod for input validation.

Double-entry validation server-side/domain-side.

## Storage

SQLite is source of truth.

External documents later should live outside transaction rows.

## Testing

Critical tests:
- balanced transaction accepted
- unbalanced rejected
- expense
- income
- transfer
- credit-card purchase
- credit-card payment
- multi-posting transaction
- opening balance
- edit preserves balance
- delete does not corrupt balance

## Money representation

MVP stores monetary values as integer minor units.

No floating-point money representation.

Currency owns the scale:

```text
Currency
├── code
├── symbol
└── minor_unit_scale
```

Account references Currency.

Posting references Account, so Posting currency is derived from Account.

MVP supports INR only.

## Transaction persistence invariant

A persisted Transaction is always complete and balanced.

Transient draft form state exists only in the client/application layer.

No persisted `DRAFT` status is required for MVP.

## Transaction ownership invariant

`transactions.member_id` is explicit.

Every Posting Account must belong to the same Member.

The domain/application layer must validate this before persistence.

## Deletion

Transactions are hard-deleted.

Delete the transaction aggregate atomically, including Postings and dependent transaction-level records.

## Naming conventions

Database:

```text
snake_case
```

Examples:

```text
member_id
transaction_id
instrument_type
created_at
```

TypeScript:

```text
camelCase
```

Examples:

```text
memberId
transactionId
instrumentType
createdAt
```

React components and TypeScript types:

```text
PascalCase
```

Enums/constants:

```text
UPPER_SNAKE_CASE
```

Keep database naming and application naming separate. ORM mappings can translate between them.

## Member context

MVP supports multiple local Members without authentication.

Application maintains an `activeMemberId`.

All Member-scoped operations require an active Member context.

The domain layer must validate ownership independently of UI state.

## Tag storage

Tags are stored inline as JSON on Account and Transaction records.

Application type:

```ts
type Tags = string[];
```

A flat list of opaque, user-defined strings — not key/value, not typed, not
hierarchical (product-polish pass, superseding the earlier
`Record<string,string>` shape).

No normalized Tag entity or join tables.

This is intentional: tags are per-record metadata/views, not shared entities.

## Transaction UI modes

Simple mode handles common two-leg transactions.

Split mode handles N-leg transactions.

The domain model remains generic; UI complexity is progressive disclosure.

## Domain invariants

Enforce in domain/application code and test them:

```text
postings >= 2
exactly one of debit/credit > 0 per posting
sum(debit) == sum(credit)
posting.account.member_id == transaction.member_id
MVP account currency == INR
```
