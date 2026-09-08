# Ledger Engineering Rules

1. Read `docs/` before implementation changes.
2. Double-entry is the accounting spine.
3. Every persisted transaction must balance.
4. Every transaction belongs to one Profile.
5. Every posting account must belong to that Profile.
6. Every Profile-scoped repository/query requires explicit `profileId`.
7. Currency: a system-maintained Currency Catalogue (code-level constant,
   `domain/currency.ts`, not a DB table) replaces the earlier INR-only
   freeze (2026-09-03 Settings/Backup/Data Management delta). Profile has
   a Primary Currency — also the Profile's Base Currency, the fixed target
   every Transaction reconciles against (default for new Accounts,
   changeable, not retroactive). Account has its own Currency
   (authoritative, changeable — not retroactively snapshotted; since
   Transactions never store a currency, changing an Account's currency
   immediately changes how every existing and future Transaction on it is
   interpreted). Genuine N-leg cross-currency Transactions are supported
   (2026-09-06/08 Account Types, Money Representation, Rational Pricing,
   FX & Liability Details delta, ADR-047 — see rule #30; supersedes and
   retires the earlier one-shape-only Currency Conversion and
   `MIXED_CURRENCY_UNSUPPORTED`): any Posting whose Account currency
   differs from the Base Currency carries its own exact-rational price
   into it, resolved from a dated CurrencyRate or an explicit user-
   confirmed rate at entry time. Still no FX conversion/aggregation beyond
   that — an entry that doesn't reconcile is rejected (`UNBALANCED`),
   never silently forced to balance.
8. Money is integer minor units.
9. Transactions are hard-deleted.
10. No persisted transaction draft/status.
11. MVP instrument taxonomy (2026-08-19 account-model delta) is
   superseded by the mandatory Account Type vocabulary — see rule #30.
   `MUTUAL_FUND`/`STOCK`/`COMMODITY` were removed earlier still (Ledger/
   Portfolio delink, ADR-040) — a Ledger Account can never be Instrument-
   backed.
12. LOAN is a plain liability ledger account only.
13. Tags are inline `string[]` (a flat list of opaque strings — product-polish
    pass, superseded the earlier `Record<string,string>` shape).
14. No global Tag entity.
15. MVP transaction UI supports 1→1 and 1→N.
16. Domain remains generic N-posting.
17. Domain/application validation must not be replaced by UI validation.
18. Do not implement deferred modules without an explicit architecture decision.
19. Prefer small, testable changes.
20. If a requirement conflicts with docs, stop and report the conflict before coding.
21. Account Type is mandatory on every Classification now (2026-09-06/08
    delta, rule #30 — supersedes this rule's original "only Asset/Liability
    have one, Income/Expense have none" scope). Account names (e.g.
    "Salary", "Rent") stay free-text user categorisation layered on top of
    their own Account Type, never a replacement for one.
22. BALANCING is a system-managed classification (the opening-balance mechanism) —
    not offered as a normal user-creatable classification in the Account form.
23. Import privacy (2026-08-26 Import Framework & Account Resolution delta) —
    a product-level requirement, not an implementation detail:
    - All import processing (parsing, classification, account resolution,
      duplicate detection, transaction extraction) happens locally. An
      uploaded statement must never be sent to an external service for any
      of these.
    - Imported files and parsed transaction data stay inside the
      self-hosted instance.
    - External pricing providers (deferred module) are a separate concern —
      they may receive the minimum instrument/query information needed for
      pricing, but never the user's transaction/import data.
    - Supported-file import must work fully offline.
24. Development/build-time privacy — the coding agent must not retain,
    commit, log, reproduce, or otherwise persist personal/financial data
    encountered during development. No real account numbers, transaction
    descriptions, names, balances, or statement contents in source code,
    logs, screenshots, documentation, or test fixtures — synthetic data
    only, everywhere committed. A parser may be *developed* against a real
    statement the user provides, but that real file must never become a
    fixture, committed file, test artifact, or part of the application's
    persistent data — replace it with a synthetic fixture (same structure,
    fake values) before anything lands in the repository.
25. Import adapter fixtures live under a `fixtures/imports/<institution>/
    <product>/` shape (e.g. `fixtures/imports/hdfc/account/sample.xlsx`) —
    synthetic, realistic-structure sample files, one per adapter.
26. Import Framework architecture (2026-08-25/26 deltas, archived in
    `docs/completed/`; see ADR-030/031/032 in `docs/07-decisions.md`):
    - Adapters are keyed `institution.product.format` (e.g.
      `hdfc.account.xls`), registered in explicit priority order; a
      generic-CSV adapter is always registered last as the universal
      fallback.
    - Account identity for import resolution is a separate
      `AccountIdentifier` entity (child of `accounts`, not a JSON column) —
      exact match first, then a masked-suffix "possible match" heuristic,
      then ambiguous-requires-user-resolution. Never auto-merged.
    - Import commit is atomic and account creation is deferred to approval:
      preview/edit is transient client state only — no `accounts` row and
      no `transactions` row exists until the single commit transaction
      runs. This holds for both the source (bank/card) account and any
      "Unknown" counter-account proposal alike.
27. Recurring Rules (2026-08-27/28 Recurring Transactions Phase 1 delta,
    archived in `docs/completed/`; see ADR-035 in `docs/07-decisions.md`):
    - A Recurring Rule is a definition (Name + Transaction Template +
      Schedule) — never a Transaction. Creating or editing one must never
      post to the Ledger. Phase 1 has no automatic transaction generation,
      no transaction matching/filtering, and no reminders.
    - Schedule is structured columns (`frequency`, `interval`,
      `by_month_day`, `by_weekday`, `start_date`, `end_date`), not a stored
      RRULE string.
    - One shared form (`RecurringForm`) serves "Add New" (empty), "Make
      recurring" (prefilled from an existing transaction, offered only for
      a normal non-split single-From transaction), and Edit alike — never
      duplicate it per entry point.
    - "Next due" and every Calendar-tab occurrence are derived on read,
      never persisted or cached.
28. Budgets (2026-09-02 Budget Framework delta, archived in
    `docs/completed/`; see ADR-036 in `docs/07-decisions.md`):
    - Budgets are expense-only. A Budget's scope is the effective account
      set: explicit Expense Accounts UNION accounts matched by its own
      condition filter — a Budget-domain type, never the Transaction
      List's `TransactionFilterState`.
    - Actual spending is never persisted — always summed at read time from
      `postings` against the relevant Budget Period's own frozen scope
      snapshot. No `budget_actual`/`budget_transaction`/`budget_posting`
      table.
    - A Recurring Budget's next Period is never created silently — only
      through the explicit "Review & Create" flow
      (`previewNextBudgetPeriod`/`approveBudgetPeriod`), defaulted from the
      previous Period's targets but fully editable first.
    - Each approved Budget Period freezes its own scope snapshot as
      permanent history. Editing an active Budget's scope/allocations
      updates only its current (latest) Period in place — never a
      historical one.
    - A transaction may contribute to multiple Budgets; double-counting
      across Budgets is intentional, not a bug.
29. Dashboards and Panels (2026-09-02 Dashboard and Panels delta, archived
    in `docs/completed/`; see ADR-037 in `docs/07-decisions.md`):
    - The Homepage is the default Dashboard for the active Profile — it
      owns no financial summary model of its own, it only renders the
      Dashboard's Panels.
    - A DashboardPanel persists identity (`key`), configuration, and
      placement (`x`, `y`) only — never balances, totals, transaction
      results, or any other derived financial fact. Panel dimensions are
      always registry-supplied, never persisted or user-resizable.
    - The Panel Registry is two files: `domain/dashboard.ts` (client-safe
      metadata) and `src/lib/panel-registry.tsx` (server-only rendering,
      since panel components read the database directly) — never import
      the rendering half from a Client Component.
    - A new Profile's Starter Dashboard is created automatically, in the
      same transaction as the Profile itself, at both of this codebase's
      Profile-creation call sites.
    - Removing a panel is immediate — no confirmation, no undo.
    - Empty panels stay visible with an explanatory empty state; a panel
      must never silently disappear or invent a default selection (e.g.
      Balances' "no accounts selected" is never read as "all accounts").
30. Account Types, Money Representation, Rational Pricing, FX & Liability
    Details (2026-09-06/08 delta, archived in `docs/completed/`; see
    ADR-047 in `docs/07-decisions.md`):
    - Account Type is mandatory on every Classification (supersedes rule
      #21's original "only Asset/Liability" scope and rule #11's frozen
      taxonomy): ASSET gets CASH/BANK/INVESTMENTS/WALLET/RECEIVABLES;
      LIABILITY gets CREDIT_CARD/LOAN/PAYABLES; INCOME gets EARNED/
      PASSIVE/WINDFALL; EXPENSE gets FIXED/VARIABLE/DISCRETIONARY/
      FINANCIAL; BALANCING gets INITIAL (system-managed only, never
      user-creatable — rule #22 unchanged). Enforced by a real
      `UNIQUE(profile_id, classification, account_type, name)` index, not
      just app-level validation.
    - A Posting's money is an exact rational, not a float: `units`
      (signed integer minor units in the Account's own currency) and
      `priceNum`/`priceDenom` (positive integers, the valuation ratio
      into the Profile's Base Currency) multiply via checked BigInt
      arithmetic and round half-to-even into `baseAmount` (signed integer
      Base Currency minor units) — never `Math.round` on a float.
      `SUM(base_amount) == 0` is the real balance invariant now, not
      `SUM(debit) == SUM(credit)`. The old `debit`/`credit`/`quantity`/
      `price` posting columns and `accounts.instrument_type` are fully
      dropped (not just left inert) — `accounts.instrumentId`/
      `instrumentLabel` stay inert per ADR-040, untouched by this delta.
    - CurrencyRate is a dated, per-Currency exchange rate (`rate_num`/
      `rate_denom`, GCD-reduced, `UNIQUE(currency_id, date)`) maintained
      inline on Settings → Currencies (Show/Hide Rates, Add/Edit/Delete)
      — never a standalone FX page or a calculator/converter. Lookup rule:
      exact date, else latest-before, else 1/1 parity — never a
      future-dated row. A Transaction's resolved rate is copied into its
      Postings at creation time; editing or deleting a CurrencyRate later
      never changes an already-committed Transaction's own numbers.
    - Liability Details (`credit_card_details`/`loan_details`, 1:1 with an
      Account via `accountId`) hold supporting fields only (credit limit,
      statement/due day, network/last4; original/disbursed amount,
      interest rate, tenure, EMI day) — no derived balance column on
      either; outstanding balance always comes from `getAccountBalances`,
      same as any other Account.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
