# v7 Change Log

v7 resolves all bootstrap findings that required product/architecture decisions.

Resolved:
1. Removed stale soft-delete/status decisions.
2. Frozen MVP instrument types:
   BANK, CASH, CREDIT_CARD, LOAN, EXPENSE, INCOME, BALANCING.
3. STOCK/METAL/etc. explicitly future investment types.
4. Tags are inline JSON `Record<string,string>` on Accounts and Transactions.
5. No normalized/global Tag entity.
6. Multiple local Members supported in one installation.
7. Active Member maintained in application state.
8. Added explicit simple/split transaction-entry UX.
9. Added posting-level domain invariants.
10. Added transaction ownership invariant.
11. Updated DBML with inline tags and Member ownership.
12. Reduced open-decisions file to genuinely deferred topics only.

MVP scope remains manual, local-first and intentionally narrow.
