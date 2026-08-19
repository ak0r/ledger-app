# Ledger — Personal Finance Tracker Documentation

Codename: Ledger

Current MVP: local-first web-based personal finance ledger.

## Running locally

Requires Node.js and pnpm (`pnpm@11.13.1`, pinned in `package.json`).

```bash
pnpm install
pnpm db:migrate   # applies migrations to the local ledger.db (creates it if missing)
pnpm dev          # http://localhost:3000
```

Other scripts:

```bash
pnpm build          # production build
pnpm start          # run the production build (after pnpm build)
pnpm test           # unit + integration tests (Vitest)
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint
pnpm db:generate     # generate a new migration after changing src/server/db/schema.ts
```

`ledger.db` (SQLite, WAL mode) is a local, gitignored artifact — Drizzle owns
the schema and migrations under `src/server/db/migrations/` are what's
versioned. If the database file is ever missing or out of date, re-run
`pnpm db:migrate`; a "no such table" error at runtime is the symptom of a
database that was never migrated.

No authentication, no cloud dependency — this is a single local install
(optionally with multiple Members, see below).

Core:
- double-entry accounting
- Members / local profiles
- Accounts
- Currencies
- Transactions
- Postings
- Expense / Income / Balancing accounts
- manual transaction entry
- balances
- basic reports
- inline key/value tags on Accounts and Transactions

## MVP account model

- `classification` defines accounting meaning.
- `instrument_type` describes the nature of the account/instrument.
- `instrument_id` and `instrument_label` are optional future-compatible fields.
- Accounts belong to exactly one Member.
- Each Account holds exactly one Currency.
- MVP supports INR only.
- Currency defines monetary scale/minor-unit precision.

## MVP instrument types

```text
BANK
CASH
CREDIT_CARD
LOAN
EXPENSE
INCOME
BALANCING
```

Future investment module may add:

```text
STOCK
METAL
MUTUAL_FUND
ETF
...
```

Do not implement investment-specific mechanics in MVP.

## MVP members

One local installation can contain multiple Members/profiles.

- no authentication
- no registration
- Members are local financial identities
- active Member is selected in application state
- Accounts, Transactions and Currencies are Member-scoped
- no shared Accounts

## MVP transaction rules

- every persisted Transaction belongs to exactly one Member
- every Transaction has at least two Postings
- every Posting references an Account owned by the Transaction Member
- every Account uses INR in MVP
- every persisted Transaction is complete and balanced
- total debit equals total credit
- each Posting has exactly one positive side: debit or credit
- zero/zero and debit+credit are invalid
- transactions are hard-deleted
- drafts exist only in transient UI/application state

## Tags

Tags are inline metadata.

```ts
type Tags = Record<string, string>;
```

Account:

```json
{
  "purpose": "Primary",
  "usage": "Salary"
}
```

Transaction:

```json
{
  "trip": "Japan2026",
  "payment": "UPILite"
}
```

No global Tag entity. No normalized tag tables. Tag changes affect only the record being edited.

## UI

Transaction entry has two modes:

1. Simple mode — common two-leg transaction.
2. Split mode — one-to-many/many-to-one multi-posting transaction.

Users do not need to understand debit/credit.

## Deferred

- Spaces
- expense sharing
- settlements
- imports
- SMS/email
- statements
- multi-currency/FX
- investments
- budgets
- transaction history UI
- AI
- authentication/sharing
- cloud sync

Read all files in `docs/` before implementation.
