# v8 Change Log

v8 resolves the latest bootstrap findings.

1. LOAN explicitly defined as plain liability ledger only.
2. Added mandatory Member-scoped repository/query rule.
3. Active Member is context, not data-isolation boundary.
4. MVP transaction UI explicitly limited to 1→1 and 1→N.
5. N→1/N→N UI deferred; domain remains generic N-posting.
6. Inline `Record<string,string>` tags explicitly limited to one value per key.
7. Added database-level row constraints for posting-side validity.
8. Aggregate invariants explicitly remain domain/application responsibilities.
9. Opening balance UX defined as optional field during Account creation.
10. Opening balance creates a normal balanced Transaction against Balancing Account.
11. Instrument taxonomy frozen.
12. Open decisions file contains only future topics.

Architecture now ready for first implementation.
