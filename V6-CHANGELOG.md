# v6 Change Log

v6 resolves bootstrap findings using latest product decisions.

Changes:
1. Transactions have explicit `member_id`.
2. Every Posting Account must belong to the Transaction Member.
3. Money uses integer minor units.
4. Currency owns the minor-unit scale.
5. MVP supports INR only.
6. Each Account holds exactly one Currency.
7. Posting currency is derived from Account.
8. Cross-currency transactions and FX are deferred.
9. Transactions use hard delete.
10. Transaction + Postings + dependent records are deleted atomically.
11. No persisted draft/status in MVP.
12. Persisted transactions are complete and balanced.
13. Investment-specific instrument types remain future-module concerns.

MVP scope remains intentionally narrow.
