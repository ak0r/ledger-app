# Ledger Engineering Rules

1. Read `docs/` before implementation changes.
2. Double-entry is the accounting spine.
3. Every persisted transaction must balance.
4. Every transaction belongs to one Profile.
5. Every posting account must belong to that Profile.
6. Every Profile-scoped repository/query requires explicit `profileId`.
7. MVP currency is INR only.
8. Money is integer minor units.
9. Transactions are hard-deleted.
10. No persisted transaction draft/status.
11. MVP instrument types are frozen (2026-08-19 account-model delta):
   BANK, CASH, CREDIT_CARD, LOAN, EXPENSE, INCOME, BALANCING, MUTUAL_FUND, STOCK, COMMODITY.
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
21. Account Type exists only where it changes real behaviour — currently only Asset
    and Liability have one. Income and Expense have no Account Type; account names
    (e.g. "Salary", "Rent") are user categorisation, never architectural types.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
