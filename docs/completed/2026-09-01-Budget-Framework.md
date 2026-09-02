# Delta — Budget Framework

## Status

**Design locked. Shipped 2026-09-02** — see the implementation note at
the end of this file, ADR-036 in `docs/07-decisions.md`, and
`docs/04-modules.md`.

**Scope:** Budget domain, recurring budget periods, allocations, filtering, history, calculation, and UI.
**Out of scope:** Goals, Plans, envelope budgeting, savings targets, FX/multi-currency implementation.

---

# 1. Purpose

Introduce Budgets as a way to track and constrain **expense activity** in Ledger.

A Budget answers:

> How much am I planning or willing to spend on a selected set of expenses?

Budgets are derived from Ledger data. They do not own transactions, and transactions do not belong exclusively to a Budget.

A transaction may contribute to multiple Budgets. Double-counting across Budgets is intentional.

---

# 2. Budget vs Goal vs Plan

## Budget

A Budget answers:

> How much can I spend?

Examples:

- Food — ₹15,000 per month
- Japan 2026 — ₹500,000
- Lifestyle — ₹30,000 per month

Budgets are **expense-only**.

## Goal

A Goal answers:

> What financial outcome am I trying to achieve?

Examples:

- Emergency fund
- House down payment
- Retirement corpus

Goals are out of scope for this Delta.

## Plan

A Plan answers:

> What larger financial activity am I organising?

Examples:

- Japan 2026
- Buying a house
- Retirement planning

Plans may eventually coordinate Budgets and Goals. Plans are out of scope for this Delta.

---

# 3. Core Budget Model

```text
Budget
│
├── Identity
├── Name
├── Type
│   ├── One-time
│   └── Recurring
│
├── Scope
│   ├── Explicit Expense Accounts
│   └── Filter Conditions
│
└── Budget Periods
    │
    ├── Approved configuration snapshot
    ├── Approved targets
    ├── Start / End dates
    │
    └── Budget Allocations
        ├── Expense Account
        └── Target Amount
```

Actual spending is never persisted.

Actuals are always derived from Ledger transactions using the corresponding Budget Period snapshot.

---

# 4. Budget Types

## 4.1 One-time Budget

A one-time Budget has a single Budget Period.

Example:

```text
Japan 2026

Flights      ₹90,000
Hotels      ₹150,000
Food         ₹40,000
Transport    ₹30,000
Other       ₹190,000
────────────────────
Total       ₹500,000
```

The Budget remains active until manually closed, archived, or otherwise completed.

A one-time Budget does not require a transaction date range. Transactions may be booked long before the actual event and still contribute through the Budget scope.

## 4.2 Recurring Budget

A recurring Budget defines successive Budget Periods.

Example:

```text
Food Expenses

Every 1 Month

Starts:
1 September 2026
```

Supported recurrence units:

- Day
- Week
- Month
- Year

Recurring Budgets require a Start Date and may terminate through:

- End Date, or
- Number of Occurrences

---

# 5. Recurring Budget Period Creation

Budget Periods are **not created silently**.

When the next Budget Period is approaching or the current period has ended, Ledger presents the next Budget for review.

Example:

```text
Food Expenses

Current Period ends in 5 days.

Next Period:
1 October 2026 – 31 October 2026

Previous Target:
₹15,000

[ Review & Create ]
```

The user must approve creation.

Before approval, the user may change:

- allocation amounts
- explicit accounts
- filter conditions
- other supported Budget configuration

The previous period's configuration and allocation amounts are used as defaults, but remain fully editable.

Each approved Budget Period stores its own configuration and targets independently.

---

# 6. Budget Scope

A Budget determines eligible expense activity through:

1. Explicit Expense Accounts
2. Filter Conditions
3. Both

The effective account set is:

```text
Explicitly Selected Expense Accounts
UNION
Expense Accounts derived from matching transactions
```

## 6.1 Explicit Account Selection

Example:

```text
✓ Expenses:Food
✓ Expenses:Restaurants
✓ Expenses:Entertainment
```

## 6.2 Filter-based Scope

Filters identify matching transactions dynamically.

Phase 1 supported columns:

- Expense Accounts
- Date
- Tags
- Description

No additional filter columns are introduced in this phase.

---

# 7. Filter Logic

The Budget filter supports:

```text
All
Any
None
```

Semantics:

```text
All  → AND
Any  → OR
None → NOT ANY
```

Example:

```text
Match: All

Expense Account | is       | Expenses:Travel
Tag             | contains | japan2026
```

The filter UI uses a generic condition builder:

```text
Match:

[ All ▼ ]

[ Column ▼ ] [ Operator ▼ ] [ Value ]

[ Column ▼ ] [ Operator ▼ ] [ Value ]

[ + Add condition ]
```

Operators depend on the selected column.

Examples:

```text
Expense Account:
is
is not

Date:
before
after
between

Tags:
contains
does not contain

Description:
contains
is
is not
```

The filter framework should remain Budget-domain specific rather than directly coupling persistence to arbitrary Transaction List filter internals.

---

# 8. Budget Allocations

`BudgetAllocation` is the domain term.

A Budget Allocation represents a target amount against an Expense Account within a Budget Period.

Example:

```text
Japan 2026

Budget Allocations

Food         ₹40,000
Flights      ₹90,000
Hotels      ₹150,000
Transport    ₹30,000
```

Budget Allocations are not child Budgets and are not independent financial entities.

## 8.1 Derived Parent Total

The Budget total is derived:

```text
Budget Total
=
SUM(Budget Allocation Target Amounts)
```

The parent Budget total is not independently editable.

## 8.2 Filter-derived Account With No Allocation

A filter may discover an Expense Account for which no target has been configured.

Example:

```text
Shopping

Budget: Not set
Actual: ₹20,000
```

The account remains visible. Ledger must not invent a target amount.

## 8.3 Scope Changes

When editing an active Budget, changing explicit accounts or filters can change derived accounts and allocations.

Ledger must show a warning before applying changes that can:

- alter matching transactions
- alter current actual spending
- change derived Expense Accounts
- remove Budget Allocations

---

# 9. Actual Spending

Budget actuals are never stored.

Do not introduce persisted accumulated spending models such as:

```text
budget_actual
budget_transaction
budget_posting
```

Actuals are calculated as:

```text
Budget Period Snapshot
        +
Ledger Transactions / Postings
        ↓
Runtime Evaluation
        ↓
Budget Actual
```

Because actuals are derived:

- transaction edits automatically affect Budget actuals
- deleted transactions stop contributing
- tag changes can add/remove transactions from filtered Budgets

No Budget-specific transaction synchronization is required.

---

# 10. Editing Budgets

Budgets may be edited after transactions have accumulated.

Before applying a change, Ledger must show a warning:

```text
Changing this Budget can change:

• Which transactions are included
• Current actual spending
• Derived Expense Accounts
• Budget Allocations

Actual spending is recalculated from Ledger data.
```

The user must explicitly confirm the change.

---

# 11. Budget Period History and Snapshots

Budget history must be preserved.

Historical Budget Periods preserve their approved configuration and targets.

## 11.1 Budget Period Snapshot

When a Budget Period is approved, Ledger stores a snapshot of:

- Period Start Date
- Period End Date
- Explicit Expense Accounts
- Filter Configuration
- Budget Allocations
- Allocation Target Amounts

The Budget Period snapshot is authoritative for evaluating that period.

Later changes to the recurring Budget must not rewrite historical Budget Period configuration.

## 11.2 Actuals Remain Runtime Derived

The snapshot does not copy transactions into Budget tables.

Historical actuals are calculated using:

```text
Historical Budget Period Snapshot
        +
Current Ledger transaction facts
        ↓
Runtime calculation
```

The distinction is:

```text
Budget configuration → persisted historical fact
Budget targets       → persisted historical fact
Budget actuals       → derived
```

---

# 12. Data Model

## 12.1 Budget

Stores the user-facing Budget identity and recurring configuration.

Conceptually:

```text
id
profileId
name
type
  ONE_TIME
  RECURRING

recurrenceUnit
  DAY
  WEEK
  MONTH
  YEAR

recurrenceInterval
recurrenceStartDate
recurrenceEndDate
recurrenceOccurrences

createdAt
updatedAt
```

Recurrence fields apply only to recurring Budgets.

## 12.2 BudgetPeriod

Represents an approved Budget occurrence/window.

Conceptually:

```text
id
budgetId

startDate
endDate

scopeSnapshot

createdAt
updatedAt
```

`scopeSnapshot` represents the approved Budget scope/filter configuration.

Implementation may normalize the snapshot into related tables, provided historical snapshot semantics are preserved.

## 12.3 BudgetAllocation

Represents a target amount for an Expense Account within a Budget Period.

Conceptually:

```text
id
budgetPeriodId
expenseAccountId
targetAmount

createdAt
updatedAt
```

The Budget total is always derived:

```text
SUM(targetAmount)
```

---

# 13. Account and Currency Behaviour

Budgets do not introduce a separate currency.

For single-currency account scope:

```text
Budget display/evaluation
→ Account currency
```

For mixed-account currency scenarios:

```text
Budget display/evaluation
→ Profile primary currency
```

Accurate aggregation of mixed currencies depends on future FX/multi-currency capability.

This Delta must not introduce an incomplete FX conversion mechanism.

---

# 14. Expense-only Boundary

Budgets are limited to Expense activity.

Budgets must not become generic trackers for:

- Income
- Assets
- Liabilities
- Equity
- Savings targets

Savings and financial outcome tracking belong to future Goals and Plans.

---

# 15. Budget UI

## 15.1 Budget Landing Page

The Budget landing page shows active Budgets.

Example:

```text
Japan 2026
₹310,000 budgeted
₹120,000 spent
₹190,000 remaining

Food Expenses
Current Period
₹15,000 budgeted
₹8,500 spent
₹6,500 remaining
```

Recurring Budgets clearly show the current period.

Upcoming periods requiring approval should be surfaced prominently.

## 15.2 Create Budget

```text
Budget Name

[ Japan 2026 ]
```

```text
Budget Type

(•) One-time
( ) Recurring
```

For recurring:

```text
Every

[ 1 ] [ Month ▼ ]

Starts

[ Date ]

Ends

(•) Never
( ) On Date
( ) After X Occurrences
```

## 15.3 Budget Scope

The user can configure:

```text
Expense Accounts

[ Select accounts ]
```

and/or:

```text
Filters

Match:
[ All ▼ ]

[ Expense Account ] [ is ] [ Expenses:Travel ]

[ Tag ] [ contains ] [ japan2026 ]

[ + Add condition ]
```

## 15.4 Budget Allocations

Ledger displays selected/derived Expense Accounts and allows targets.

Example:

```text
Budget Allocations

Flights
[ ₹90,000 ]

Hotels
[ ₹150,000 ]

Food
[ ₹40,000 ]

Transport
[ ₹30,000 ]

────────────────────────

Total Budget

₹310,000
```

The Total is read-only and derived.

---

# 16. Recurring Budget Review

Before a new recurring Budget Period is created:

```text
Food Expenses

Next Period

1 October – 31 October

Previous Budget

Food
₹15,000

[ Edit ]

[ Create Budget ]
```

The user must explicitly approve.

No automatic Budget Period creation is permitted.

---

# 17. Home / Dashboard Integration

Ledger should surface recurring Budgets requiring attention.

Examples:

```text
Budget ending soon

Food Expenses
Ends in 5 days

[ Review next period ]
```

or:

```text
Next Budget ready

Food Expenses
1 October – 31 October

[ Review & Create ]
```

This prevents gaps while preserving explicit user approval.

---

# 18. Non-goals

The following are explicitly out of scope.

## Envelope Budgeting

Not implemented.

Future envelope budgeting may build on or integrate with this model.

## Goals

Not implemented.

## Plans

Not implemented.

## Savings Budgets

Not implemented.

## Automatic Period Creation

Not implemented.

Recurring Budget Periods require explicit user approval.

## Persisted Actuals

Not implemented.

Actual spending remains runtime-derived.

## Transaction-to-Budget Ownership

Not implemented.

Transactions do not belong exclusively to a Budget.

## FX Conversion Engine

Not implemented.

Mixed-currency aggregation remains dependent on future FX/multi-currency work.

---

# 19. Core Principles

### Budgets do not own transactions

```text
Ledger Transactions
        ↓
Budget filters evaluate them
```

### Actuals are derived

Never manually synchronized.

### Targets are historical facts

Approved Budget Period targets are persisted.

### Scope is historical per Budget Period

Each approved Budget Period evaluates using its own approved scope snapshot.

### Overlap is allowed

The same transaction may contribute to multiple Budgets.

### Budget rows are allocations, not child Budgets

Use:

```text
BudgetAllocation
```

not:

```text
ChildBudget
```

### Recurrence is optional

Budgets can be:

- One-time
- Recurring

### Approval is explicit

Recurring Budget Periods are never silently created.

---

# 20. Implementation Outcome

```text
User creates Budget
        ↓
Defines one-time or recurring behaviour
        ↓
Selects Expense Accounts and/or Filter Conditions
        ↓
Defines Budget Allocations
        ↓
Approves Budget Period
        ↓
Ledger derives Actuals from matching transactions
        ↓
Budget shows Target / Actual / Remaining
        ↓
Recurring Budget suggests next Period
        ↓
User reviews and approves
```

The resulting Budget framework preserves room for future:

- Goals
- Plans
- Budget insights and trends
- Envelope budgeting integration
- Multi-currency support

---

## Implementation note (added when archived, 2026-09-02)

Shipped as designed, with these locked interpretations (see
`docs/07-decisions.md` ADR-036 for the full rationale):

- **§7 Filter framework**: `BudgetFilterCondition`/`BudgetFilterState`
  (`src/domain/budget.ts`, evaluated by `src/lib/budget-filter.ts`) are a
  Budget-domain-specific type, not a reuse of the Transaction List's
  `TransactionFilterState` — this delta's own instruction. `expenseAccount`
  resolution only ever looks at a transaction's EXPENSE-classified
  postings, consistent with §14's expense-only boundary.
- **§4.2/§12.2 Budget Period model**: a window (`startDate`/`endDate`), not
  a single occurrence date — `budgetPeriodWindowAt`/
  `currentOrNextBudgetPeriod`/`nextBudgetPeriodAfter`
  (`src/domain/budget.ts`) are a parallel forward-scan implementation to
  Recurring Rule's point-in-time `nextOccurrence` (ADR-035), sharing only
  the month-end clamping posture. A ONE_TIME Budget's single Period always
  has null `startDate`/`endDate` (§4.1), so `calculateBudgetActuals` skips
  date filtering entirely in that case.
- **§8.3/§10 Scope-change warning**: enforced client-side
  (`src/components/budget-form.tsx`'s `ConfirmDialog` gate on the edit
  submit path, exact copy from §10) — the use-case layer applies the
  change unconditionally once called, same posture as every other
  confirm-before-mutate flow in this codebase.
- **§10/§11.1 Editing an active Budget**: updates the *current* (latest)
  Budget Period's scope snapshot and allocations in place; only Periods
  other than the current one are ever frozen against later edits. §5's
  separate "Review & Create" flow (`previewNextBudgetPeriod`/
  `approveBudgetPeriod`) is the only path that creates a new,
  independently-frozen Period.
- **§16/§17 "Ending soon"**: no threshold is specified in this delta
  (its own mockups show one example, "Ends in 5 days," without defining
  the window that copy applies within). `BUDGET_REVIEW_WINDOW_DAYS = 7`
  (`src/server/use-cases/budgets.ts`) is this implementation's chosen
  cutoff — `listBudgetsWithSummary`'s `reviewDue` flag drives the "Review
  Next Period" affordance on both the Budgets landing page and the Home
  dashboard. Approval itself stays explicit regardless of the threshold
  (§5), so this is a UX nit to revisit, not a correctness risk.
- **§8.2 Filter-derived account with no allocation**: shown on the
  Budgets landing page and detail view (`calculateBudgetActuals`'s `rows`,
  `targetAmountMinor: null`) once a Period exists to derive actuals
  against. The Create/Edit/Review forms themselves only ever offer targets
  for explicitly-selected accounts — there is nothing to preview
  client-side for a filter-derived account without a full server
  evaluation of every transaction against the draft filter, which these
  forms don't perform.
