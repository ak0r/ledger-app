# Architecture Decision Log

## ADR-001 — Double-entry
Accepted. Double-entry is the accounting spine.

## ADR-002 — Transaction contains postings
Accepted. Use `Transaction -> Postings[]`.

## ADR-003 — Expense categories are Expense Accounts
Accepted. No separate accounting Category entity.

## ADR-004 — Rename Equity
Accepted. Use `BALANCING` instead of user-facing `EQUITY`.

## ADR-005 — Currency belongs to accounts
Accepted. Currencies are Member/Profile-specific. Default INR.

## ADR-006 — Members do not require registration
Accepted. Member is a financial identity/profile, not necessarily an authenticated user.

## ADR-007 — Spaces are a module
Accepted. Not MVP core.

## ADR-008 — Expense sharing is a module
Accepted. Separate from accounting split.

## ADR-009 — Imports are a module
Accepted. Raw external data becomes candidate/postable transactions.

## ADR-010 — History is deferred
Accepted. Editing/deletion allowed in MVP; history UI later.

## ADR-011 — No merchant entity in MVP
Accepted. Use description/payee text.

## ADR-012 — SQLite
Accepted. Local-first SQLite. No Supabase/Postgres dependency for MVP.

## ADR-013 — AI is not core
Accepted. Future module consuming ledger/query data.

## ADR-014 — Tags are views
Accepted. Tags filter transactions/accounts without changing accounting classification. Account Tags and Transaction Tags are separate.

## ADR-015 — Account classification vs instrument type

Accepted.

`classification` determines accounting meaning. `instrument_type` describes the nature of the account/instrument.

Examples:

```text
ASSET + BANK
ASSET + STOCK
ASSET + METAL
LIABILITY + LOAN
EXPENSE + EXPENSE
```

Do not use instrument type to determine accounting treatment.

## ADR-016 — Instrument identifiers are optional

Accepted.

`instrument_id` and `instrument_label` are optional Account fields.

Examples:
- stock: ISIN
- metal: commodity/security identifier
- bank: institution/instrument identifier
- loan: may have no instrument identifier

Investment-specific use remains deferred.

## ADR-017 — Database naming convention

Accepted.

```text
Database: snake_case
TypeScript: camelCase
React components/types: PascalCase
Enums/constants: UPPER_SNAKE_CASE
```

Do not force one naming convention across all layers.

## ADR-018 — Explicit transaction ownership

Accepted.

Transactions contain `member_id`. Every Posting Account must belong to that same Member.

## ADR-019 — Hard delete

Accepted. MVP permanently deletes a transaction and its dependent records atomically. No soft-delete field is required.

## ADR-020 — INR-only MVP

Accepted. MVP supports INR only. No FX or currency conversion.

## ADR-021 — Account owns currency

Accepted. Each Account references exactly one Currency. Posting currency is derived from Account.

## ADR-022 — Currency owns scale

Accepted. Monetary values use integer minor units. Do not use floating-point values for money.

## ADR-023 — No persisted transaction draft

Accepted. Drafts exist only in transient UI/application state. A persisted transaction exists only after validation and successful atomic posting.

## ADR-024 — MVP instrument taxonomy

Accepted.

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

STOCK, METAL, MUTUAL_FUND, ETF and similar types belong to future investment modules.

## ADR-025 — Multiple local Members

Accepted.

One local installation may contain multiple Members.

No authentication or registration in MVP.

Active Member is application state.

## ADR-026 — Inline tags

Accepted. Superseded in shape by the product-polish pass (still accepted,
storage/scoping unchanged) — see below.

Account and Transaction records store independent inline JSON:

```ts
string[]
```

A flat list of opaque, user-defined strings — not key/value (the original
version of this ADR specified `Record<string, string>`; product-polish
replaced it with a simple tag list, no typed/hierarchical semantics).

No global Tag entity and no tag join tables.

Reason:
- tags are views/metadata
- changing one record's tag must not rename/change other records
- simple MVP storage
- avoids unnecessary global tag lifecycle

## ADR-027 — Progressive transaction entry

Accepted.

MVP provides:
- Simple mode for common two-leg transactions
- Split mode for multi-posting transactions

Core accounting model remains generic N-posting.

## ADR-028 — Posting-level invariants

Accepted.

Every Posting must have exactly one positive side.

```text
debit >= 0
credit >= 0
exactly one > 0
```

Every Transaction must have at least two Postings and balance.

These are domain rules, not UI-only validation.
