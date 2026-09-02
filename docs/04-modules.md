# Modules and Boundaries

Core ledger:

```text
Profile
Currency
Account
Transaction
Posting
```

Identity (separate from the ledger domain — see
`docs/completed/2026-08-20-User-Simplification.md`):

```text
AppUser  ──1:1──  Profile
```

## Spaces — deferred

Spaces provide context such as Japan 2026 or Home.

Types:

```text
PERSONAL
SHARED
```

Profiles can participate without registration.

Spaces are a module, not accounting entities.

## Expense Sharing — deferred

Separate from accounting splits.

Purpose:

- split shared expenses between Profiles
- calculate obligations
- receivables/payables
- settlement payments

Accounting split:

```text
₹5,000
Food       ₹2,000
Transport  ₹3,000
```

Expense sharing:

```text
₹5,000
Profile A   ₹2,000
Profile B   ₹3,000
```

Do not merge these concepts.

## Imports

Shipped (2026-08-25/26 deltas, archived in `docs/completed/`; see
ADR-030/031/032 in `docs/07-decisions.md`). Locked pipeline:

```text
Upload file(s)
    ↓
Detect adapter
    ↓
Parse
    ↓
Normalise
    ↓
Account Resolution
    ↓
Import Preview (editable, transient)
    ↓
User Approval
    ↓
Commit to Ledger (atomic)
```

- **Adapters**: registered `institution.product.format` (e.g.
  `hdfc.account.xls`), tried in priority order; a generic-CSV adapter is
  always last as the universal fallback. An adapter owns only parsing +
  extracting the source account identifier — never Ledger-specific
  categorization.
- **Account Resolution**: the source (bank/card) account and every
  counter-account (e.g. the "Unknown" catch-alls) are resolved the same
  way — exact `AccountIdentifier` match, then a masked-suffix "possible
  match", then ambiguous-requires-user-resolution, or a proposed new
  account. Nothing is created until commit.
- **Commit**: one atomic transaction creates any approved new Accounts (+
  their `AccountIdentifier` rows), the `ImportFile` provenance row(s), and
  the resulting Transactions/Postings — normal double-entry rows,
  permanently tagged with `import_file_id`.
- Sources supported today: generic CSV, HDFC Bank Account XLS, Axis Bank
  Account XLS, IDFC FIRST Bank Account XLS, Federal Bank Account PDF.
- Password-protected files (Federal Bank's PDF statements, ADR-034): the UI
  prompts for a password only when the adapter reports one is needed (or
  wrong), sends it once to the server for that single parse call, and never
  persists it — not in the `ImportFile` row, not in a log, not anywhere.
  Approval/commit never re-reads the original file, so the password never
  needs to flow past preview.

**Still deferred** (explicit future plugin extension points, not built):
Rules (auto-categorization), Duplicate Detection, any adapter beyond the
five above, email/SMS statement sources, PDF statements from any
institution other than Federal Bank.

## Recurring Transactions

Phase 1 shipped (2026-08-28, `docs/completed/2026-08-27-Recurring-Transactions.md`;
see ADR-035 in `docs/07-decisions.md`). A Recurring Rule is a **definition**
(Name + Transaction Template + Schedule), never a Transaction itself —
creating or editing one never posts to the Ledger.

- **Two entry points**: `+ Add New` on the `/recurring` page (blank form),
  or `Make recurring` on a transaction row's `...` menu (prefills the same
  form from that transaction; the two stay independent afterward).
- **Schedule**: Daily/Weekly/Monthly/Yearly, structured columns (not a
  stored RRULE string — ADR-035), Start date, optional End date.
- **Recurring page**: two read-only views over the same rules — **Rules**
  (Name/Next Due/Schedule/Amount, Edit/Delete) and **Calendar** (month
  grid of occurrences, derived on read, never persisted).

**Still deferred** (explicit future capability, not built): automatic
transaction generation/posting, transaction matching/filtering, reminders
and notifications.

## Budgets

Shipped 2026-09-02 — `docs/completed/2026-09-01-Budget-Framework.md`, ADR-036
in `docs/07-decisions.md`. Consume ledger data; calculated spend is not
source of truth (never persisted — always summed at read time from
`postings`).

A Budget (One-time or Recurring) tracks Expense activity only, through an
effective account set — explicit Expense Accounts UNION accounts matched by
a Budget-domain-specific condition filter (deliberately not the Transaction
List's own filter type). A Recurring Budget's successive Budget Periods are
never created silently: each requires explicit "Review & Create" approval,
defaulted from the previous Period's targets but fully editable first. Each
approved Period freezes its own scope snapshot — later edits to the Budget
never rewrite a historical Period's configuration, only the current one.

**Still deferred** (explicit future capability, not built): Goals, Plans,
envelope budgeting, savings budgets, an FX conversion engine, and
Budget-to-transaction ownership (a transaction may contribute to multiple
Budgets; double-counting across Budgets is intentional).

## Investments

Foundations only: an `Instrument` catalogue entity exists (shared reference
data, not Profile-scoped) and `MUTUAL_FUND`/`STOCK`/`COMMODITY` are frozen
Account instrument types — Step 1 of `docs/pending/2026-08-21-Instrument-Model-Pricing-Foundations.md`'s
10-step plan. Quantity, pricing, valuation, and the rest of that plan are
still not built.

## Reports

MVP basic reports consume ledger data.

## Insights / AI

Future module. AI consumes query/report data and never becomes accounting truth.

## History

Future module. Expected model:

```text
Transaction
    ↓
TransactionVersion[]
```

Frozen transaction-entry representation.

Suggested visual states:

- green = added
- yellow = modified
- red = deleted
