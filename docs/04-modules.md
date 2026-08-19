# Modules and Boundaries

Core ledger:

```text
Member
Currency
Account
Transaction
Posting
```

## Spaces — deferred

Spaces provide context such as Japan 2026 or Home.

Types:

```text
PERSONAL
SHARED
```

Members can participate without registration.

Spaces are a module, not accounting entities.

## Expense Sharing — deferred

Separate from accounting splits.

Purpose:
- split shared expenses between members
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
Member A   ₹2,000
Member B   ₹3,000
```

Do not merge these concepts.

## Imports — deferred

Future sources:
- Email
- SMS
- PDF statements
- CSV/XLS

Conceptual pipeline:

```text
Raw Source
    ↓
Parser
    ↓
Candidate Transaction
    ↓
Review
    ↓
Posted Transaction
```

Import logic stays outside accounting core.

## Budgets

Consume ledger data. Calculated spend is not source of truth.

## Investments

Future module.

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
