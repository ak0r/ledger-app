# Vision

Ledger is a self-hosted personal finance application built on a strong
double-entry accounting foundation, with an investment-tracking Portfolio
domain alongside it, under a simple consumer UI.

> Accounting is the spine. Product features are modules around it.

No longer an MVP: identity, accounts, transactions, imports, recurring
transactions, budgets, a configurable dashboard, multi-currency support,
and Portfolio (CAS/eCAS/tradebook import, NAV/XIRR valuation) are shipped.
See `docs/04-modules.md` for what's built and `docs/10-open-decisions.md`
for what's still deliberately deferred.

Core model:

```text
Transaction
    ↓
Postings
    ↓
Accounts
```

Principles:

- Money belongs to people through accounts.
- Transactions describe financial events.
- Postings represent accounting effects.
- Accounts have accounting classifications.
- Tags provide additional views without changing accounting classification.
- Future features remain modular.
- UI hides unnecessary accounting complexity.
- Financial integrity is enforced by the system.
