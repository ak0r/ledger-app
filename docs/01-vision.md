# Vision

Build a personal finance application with a strong double-entry accounting foundation and a simple consumer UI.

> Accounting is the spine. Product features are modules around it.

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
