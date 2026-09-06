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

## Dashboard and Panels

Shipped 2026-09-02 — `docs/completed/2026-09-02-Dashboard-and-Panels.md`,
ADR-037 in `docs/07-decisions.md`. The Homepage is the default Dashboard
for the active Profile — it owns no separate financial summary model, it
only renders the Dashboard's Panels.

A Dashboard Panel persists identity (`key`), configuration, and (x, y)
placement only — never balances, totals, or any other derived financial
fact; width/height are always registry-supplied, never persisted. Every
new Profile gets a Starter Dashboard automatically (Net Worth/Assets/
Liabilities cards, Balances/Recent Expenses/Recent Transactions lists). A
7th panel, Budgets Needing Review, is catalogue-only (not part of the
starter set, added via "+ Add Panel") — it carries over the Home page's
own prior hardcoded "Budgets needing review" card. Panels are movable via
drag-and-drop on a fixed-size Bento grid (`@dnd-kit/core`), addable,
configurable, and removable (immediately, no confirmation) — never
resizable.

**Still deferred** (explicit future capability, not built): multiple
Dashboards per Profile, a Charts panel category, Investment-dependent
panels (Recent Investments/Portfolio Value/Portfolio NAV — not even as
placeholders), user-resizable panels, separate mobile layouts.

## Currency Catalogue

Shipped 2026-09-03 (Settings/Backup/Data Management delta) — lifts the
earlier INR-only freeze (ADR-020) per explicit user direction, without
adding FX. The Currency Catalogue itself (`core/shared/currency.ts`) is a
code-level constant — a system-maintained, mostly-static reference list of
currency definitions (code/name/symbol/minor-unit scale) — never a DB
table; `currencies` stays a per-Profile instantiation record of a code
drawn from it (`/settings/currencies`' "Add Currency" picker).

- A Profile has a **Primary Currency** — the default for a newly created
  Account, changeable at any time, never applied retroactively to existing
  Accounts.
- An Account has its own **Currency** — authoritative for every Transaction
  posted against it, changeable at any time, and (since Transactions never
  store a currency of their own) that change immediately reinterprets every
  existing and future Transaction on that Account, not just future ones.
- No FX, conversion, or cross-currency aggregation of any kind. A
  Transaction whose postings resolve to more than one currency is rejected
  outright (`MIXED_CURRENCY_UNSUPPORTED`) — the sole exception is the
  2-posting Currency Conversion shape (`postings.quantity`/`price`,
  ADR-038), which persists an explicit exchange rate for that one
  transaction rather than aggregating across currencies.

## Settings, Backup & Data Management

Shipped 2026-09-03 (Settings/Backup/Data Management delta), alongside the
Currency Catalogue above. `/settings` groups Profiles, Currencies, and
Backups under one area.

- **Local backup**: one physical `ledger.db` file is the whole Hosted
  Instance (every AppUser/Profile/Account/Transaction/Budget/Dashboard/
  Currency), so a backup is `better-sqlite3`'s native `.backup()` of that
  one file to a fixed server-filesystem path (`<data>/backups`) — not a
  user-editable location, and not a browser-side download. Automatic daily
  backup is on by default, toggleable, opportunistically triggered
  (`runBackupIfDue`) the same way NAV refresh is (`docs/04-modules.md`'s
  Investments section) — due since the backup history table's own most
  recent row, not a separate settings row.
- **Clean Up Content** wipes a Profile's Accounts/Transactions/Currencies
  without deleting the Profile itself — the documented way to discard demo
  data or start over (used by the onboarding "Start from Scratch"/demo-data
  flows).

## Investments

**Ledger/Portfolio delink (2026-09-05, ADR-040,
`analysis/folioman-vs-ledger/06-pwa-validation-and-domain-delink.md`) —
supersedes the account-integrated model below.** A Ledger Account can
never be Instrument-backed again: `MUTUAL_FUND`/`STOCK`/`COMMODITY` are
removed from `INSTRUMENT_TYPES`; Asset Accounts are `CASH`/`BANK` only.
Portfolio is a separate future domain (`core/portfolio`) with its own
`PortfolioAccount`/`InvestmentTransaction`/`Holding` model (Folioman's
actual shape, `analysis/folioman-vs-ledger/07-folioman-database-model.md`)
— never Ledger's `accounts`/`transactions`/`postings`. Not yet built
(gated on a portfolio domain document in progress).

**What's preserved from the account-integrated era, and reused going
forward:** the Instrument Catalogue itself — real STOCK/MUTUAL_FUND
ingestion from IndianAPI (Analyst primary, Pro fallback,
upsert-preserving-on-failure), NSE/BSE/ISIN identifiers, local search —
is untouched and will back the future Portfolio module directly; it never
depended on `accounts` at the schema level. `postings.quantity`/`price`
and the domain's reconciliation-value balance check are also preserved,
but now purely for Currency Conversion's persisted exchange rate — the
Instrument-backed branch of that check is removed.

**What's gone:** the Account form's Instrument picker, the transaction
form's Units field, the transaction list's quantity/unit-price display,
and `accounts.instrumentId`/`instrumentLabel` as a live linkage (columns
remain in the schema, unwritten, pending a real Phase 3 data migration for
any Account created under the old model). Original history: Step 1 of
`docs/completed/2026-08-21-Instrument-Model-Pricing-Foundations.md`'s
10-step plan shipped 2026-08-22; the "Revised Investment Model" delta
(2026-09-03, ADR-038) and "Instrument Catalogue" delta (2026-09-04,
ADR-039, `docs/completed/2026-09-04-Instrument-Catalogue.md`) built the
now-superseded Account↔Instrument bridge.

### Portfolio (shipped)

The Portfolio domain promised above is built: its own `PortfolioAccount`/
`Folio`/`InvestmentTransaction`/`Holding`/`NAVHistory`/`PortfolioImport`
model (`core/portfolio`, ADR-041), a top-level nav section (Overview/Mutual
Funds/Stocks/Accounts-Folios/Imports, ADR-042) alongside Ledger's own, and
a cross-domain Import Center. "Security" (the investment) and "Holding"
(the Profile's position in it) are kept as distinct, consistently-labeled
concepts throughout — "Instrument" stays backend-only vocabulary.

Import paths, all sharing one Upload → Preview (counts/warnings, zero
writes) → Approval → Commit shape (ADR-042):

- **Mutual Fund CAS** (CAMS/KFin Consolidated Account Statement PDF) —
  `casparser` run as a local subprocess (ADR-041), never a network call.
  Every scheme resolves to an Instrument by ISIN or AMFI code; every
  transaction gets a content-hash dedup key; the statement's own closing
  balance is recorded as an observed `Holding` snapshot. A statement whose
  PAN doesn't match the active Profile's registered PAN is rejected
  outright (ADR-042) — no auto-create-a-new-Profile offer (Folioman has
  one; deliberately deferred, ADR-042).
- **Demat eCAS** (NSDL/CDSL holdings-snapshot PDF) — the equity analog of
  the MF CAS's closing balance: no transaction history, only a point-in-
  time position per demat account (ADR-045). Equities only in V1 — no
  demat-held Mutual Fund or Bond. PortfolioAccount/Folio auto-resolve from
  the file's own `dp_id`/`client_id`. Every demat account in one statement
  must agree on a single PAN, or the statement is rejected.
- **Stock Tradebook** (a broker's own equity delivery CSV — Zerodha's
  format plus a header-alias generic fallback, ADR-043) — the destination
  PortfolioAccount/Folio are picked or created by the user first (a
  tradebook carries no investor identity to auto-resolve one from). The
  dedup key includes the broker's own trade ID from the start, closing a
  same-day/same-price/same-quantity collision class before it could
  happen.
- Both the MF CAS and eCAS paths reject a file shaped like the other with
  a clear message, rather than crashing on an undefined property
  (ADR-045).

Valuation (ADR-044): an AMFI bulk feed refreshes every catalogued Mutual
Fund's NAV in one request; NSE's own historical-data endpoint refreshes
Stocks one at a time, falling back to Yahoo Finance on an NSE miss
(ADR-046) — both opportunistic, `after()`-triggered, same "due since the
history table's own last row" posture as the existing backup refresh.
XIRR (Newton-Raphson with a bisection fallback, `core/portfolio/
valuations/xirr.ts`) is computed per Instrument using the NAV's own
recorded date as the terminal cashflow date, never wall-clock "today." A
cut-down Holding-integrity signal (`VERIFIED`/`SNAPSHOT_ONLY`/`undefined`,
not Folioman's full five-state reconciliation) compares the
transaction-implied position against the latest observed snapshot.

**Still deferred, deliberately:** capital-gains/tax computation (LTCG/
STCG, Schedule 112A), corporate-action (bonus/split) detection or replay,
partial-history chaining, automatic Folio-identity reconciliation between
a tradebook's manually-typed Folio and an eCAS's auto-derived one (a UI
nudge showing the derived number exists; no merge algorithm), retry/
backoff on the Yahoo feed, and demat-held Mutual Fund/Bond holdings from
an eCAS (no BOND instrument type exists to receive one).

## Reports

Basic reports consume ledger data read-side only (income, expenses,
account balances, transaction trends, tag-filtered views).

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
