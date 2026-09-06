# Ledger — Personal Finance Tracker Documentation

Codename: Ledger

A self-hosted, local-first personal finance app: a double-entry
accounting ledger with an investment-tracking Portfolio domain alongside
it. No longer an MVP — see `docs/05-scope.md` for current feature scope
and `docs/10-open-decisions.md` for what's still deliberately deferred.

## Running locally

Requires Node.js and pnpm (`pnpm@11.13.1`, pinned in `package.json`).

```bash
pnpm install
pnpm db:migrate   # applies migrations to the local ledger.db (creates it if missing)
pnpm dev          # http://localhost:3000
```

`pnpm install`'s `postinstall` step also provisions an isolated `.venv` with
`casparser` (`scripts/setup-python.mjs`) — the one non-Node runtime
dependency, needed only for Portfolio's CAS/eCAS PDF import. It requires
Python 3 on `PATH`; every other Ledger feature works with no Python at all.
If it's missing or fails, `pnpm install` still succeeds (with a warning) —
install Python 3 and re-run `pnpm setup:python` to pick it up later, or set
`LEDGER_PYTHON` to point at a different interpreter.

Other scripts:

```bash
pnpm build          # production build
pnpm start          # run the production build (after pnpm build)
pnpm test           # unit + integration tests (Vitest)
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint
pnpm db:generate     # generate a new migration after changing src/server/persistence/schema.ts
```

`ledger.db` (SQLite, WAL mode) is a local, gitignored artifact — Drizzle owns
the schema and migrations under `src/server/persistence/migrations/` are
what's versioned. If the database file is ever missing or out of date,
re-run `pnpm db:migrate`; a "no such table" error at runtime is the symptom
of a database that was never migrated.

No cloud dependency — this is a single self-hosted instance. Real
authentication exists (AppUser registration/login); each AppUser is linked
to exactly one Profile, and a Primary User (the first AppUser registered)
can create/access additional Profiles for others.

## What's built

**Ledger** (the accounting spine, `core/ledger`):

- Double-entry accounting: Profile / Currency / Account / Transaction /
  Posting, atomic posting, balance validation
- AppUser identity, Profile as financial identity
- Accounts: create/edit/archive, classification, instrument type,
  inline tags, computed balance
- Transactions: Simple mode (one From, one To) and Split mode (one From,
  many To), full edit (atomic replace), hard delete, merge, filters/search
- Statement import: generic CSV, HDFC/Axis/IDFC FIRST Bank Account XLS,
  Federal Bank Account PDF (password-protected) — account resolution,
  editable preview, atomic commit
- Recurring Transactions (Phase 1): rule definitions on a schedule, never
  auto-posted
- Budgets: One-time/Recurring, Expense-only, scoped by account and/or
  filter, actuals always summed live, never persisted
- A configurable Dashboard: panels for Net Worth/Assets/Liabilities/
  Balances/Recent Expenses/Recent Transactions/Budgets Needing Review
- Currency Catalogue: multiple currencies per Profile, a Profile Primary
  Currency, an independently changeable Account Currency — no FX/
  conversion/cross-currency aggregation
- Local backup (whole-instance `ledger.db` file) and Clean Up Content
- Inline tags (flat list of strings) on Accounts and Transactions

**Portfolio** (investment tracking, `core/portfolio` — a deliberately
separate sibling domain, never a Ledger Account/Transaction/Posting):

- Its own model: PortfolioAccount / Folio / InvestmentTransaction /
  Holding / NAVHistory
- Import: Mutual Fund CAS PDF, demat eCAS PDF (equities only), Stock
  Tradebook CSV — each Upload → Preview → Approval → Commit
- Valuation: AMFI bulk NAV feed (Mutual Funds), NSE feed with a Yahoo
  Finance fallback (Stocks), XIRR, a cut-down Holding-integrity signal

See `docs/04-modules.md` for full detail per module and
`docs/07-decisions.md` for the architecture decision log.

## Account model

- `classification` defines accounting meaning (Asset/Liability/Income/
  Expense/Balancing).
- `instrument_type` describes the nature of the account: `BANK`, `CASH`,
  `CREDIT_CARD`, `LOAN`, `EXPENSE`, `INCOME`, `BALANCING` (frozen, rule
  #11). A Ledger Account can never be Instrument-backed — investment
  accounts belong to the separate Portfolio domain above.
- Accounts belong to exactly one Profile and hold exactly one Currency,
  drawn from the Currency Catalogue.

## Identity: AppUser and Profile

- AppUser is the real login identity (email/password, session-based).
- Each AppUser is linked to exactly one Profile (the financial identity);
  a Profile can also exist unlinked (created by the Primary User for
  someone who registers later).
- The Primary User (first AppUser ever registered) can access every
  Profile in the instance via `/settings/profiles`; a normal AppUser has
  exactly one.
- Accounts, Transactions and Currencies are Profile-scoped.
- No shared Accounts across Profiles.

See `docs/completed/2026-08-20-User-Simplification.md` for the full model.

## Ledger transaction rules

- every persisted Transaction belongs to exactly one Profile
- every Transaction has at least two Postings
- every Posting references an Account owned by the Transaction's Profile
- every persisted Transaction is complete and balanced
- total debit equals total credit
- each Posting has exactly one positive side: debit or credit
- zero/zero and debit+credit are invalid
- a Transaction's postings resolve to exactly one currency
  (`MIXED_CURRENCY_UNSUPPORTED` otherwise), except the one Currency
  Conversion shape
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
- expense sharing / settlements
- Import Rules / Duplicate Detection plugins
- import adapters beyond the ones shipped
- SMS/email statement import
- FX conversion / cross-currency aggregation
- Portfolio: capital-gains/tax, corporate-action replay, demat-held
  Mutual Fund/Bond holdings from an eCAS
- transaction history UI
- AI
- cloud sync

Full current-vs-deferred breakdown: `docs/05-scope.md` and
`docs/10-open-decisions.md`.

Read all files in `docs/` before implementation.
