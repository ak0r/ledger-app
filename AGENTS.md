# Ledger Engineering Rules

1. Read `docs/` before implementation changes.
2. Double-entry is the accounting spine.
3. Every persisted transaction must balance.
4. Every transaction belongs to one Member.
5. Every posting account must belong to that Member.
6. Every Member-scoped repository/query requires explicit `memberId`.
7. MVP currency is INR only.
8. Money is integer minor units.
9. Transactions are hard-deleted.
10. No persisted transaction draft/status.
11. MVP instrument types are frozen (2026-08-19 account-model delta):
   BANK, CASH, CREDIT_CARD, LOAN, EXPENSE, INCOME, BALANCING, MUTUAL_FUND, STOCK, COMMODITY.
12. LOAN is a plain liability ledger account only.
13. Tags are inline `Record<string,string>`.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
