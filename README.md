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

No cloud dependency — this is a single self-hosted instance. Real
authentication exists (AppUser registration/login); each AppUser is linked
to exactly one Profile, and a Primary User (the first AppUser registered)
can create/access additional Profiles for others.

Core:
- double-entry accounting
- AppUser identity, Profile as financial identity (see below)
- Accounts
- Currencies
- Transactions
- Postings
- Expense / Income / Balancing accounts
- manual transaction entry
- statement import (CSV, HDFC Account XLS) with account resolution + review before commit
- balances
- basic reports
- inline tags (flat list of strings) on Accounts and Transactions

## MVP account model

- `classification` defines accounting meaning.
- `instrument_type` describes the nature of the account/instrument.
- `instrument_id` and `instrument_label` are optional future-compatible fields.
- Accounts belong to exactly one Profile.
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

`MUTUAL_FUND`/`STOCK`/`COMMODITY` are frozen types (instrument-backed — see
the separate Instrument catalogue entity), but full investment mechanics
(quantity, pricing, valuation) aren't implemented yet.

## Identity: AppUser and Profile

- AppUser is the real login identity (email/password, session-based).
- Each AppUser is linked to exactly one Profile (the financial identity);
  a Profile can also exist unlinked (created by the Primary User for
  someone who registers later).
- The Primary User (first AppUser ever registered) can access every
  Profile in the instance via `/profiles`; a normal AppUser has exactly one.
- Accounts, Transactions and Currencies are Profile-scoped.
- No shared Accounts across Profiles.

See `docs/completed/2026-08-20-User-Simplification.md` for the full model.

## MVP transaction rules

- every persisted Transaction belongs to exactly one Profile
- every Transaction has at least two Postings
- every Posting references an Account owned by the Transaction's Profile
- every Account uses INR in MVP
- every persisted Transaction is complete and balanced
- total debit equals total credit
- each Posting has exactly one positive side: debit or credit
- zero/zero and debit+credit are invalid
- transactions are hard-deleted
- drafts exist only in transient UI/application state

## Tags

Tags are an inline flat list of opaque strings — not key/value.

```ts
type Tags = string[];
```

Account:

```json
["travel", "salary"]
```

Transaction:

```json
["Japan2026", "UPILite"]
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
- Import Rules / Duplicate Detection plugins
- import adapters beyond the five shipped (generic CSV, HDFC/Axis/IDFC FIRST/Federal Bank Account XLS/PDF)
- SMS/email statement import
- multi-currency/FX
- investment valuation/pricing/quantity
- budgets
- transaction history UI
- AI
- cloud sync

Read all files in `docs/` before implementation.
