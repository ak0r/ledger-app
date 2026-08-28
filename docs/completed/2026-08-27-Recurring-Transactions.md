# Delta: Recurring Transactions

## Status

**Design locked. Phase 1 shipped 2026-08-28** — see the implementation
note at the end of this file, ADR-035 in `docs/07-decisions.md`, and
`docs/04-modules.md`.

This delta defines the first implementation of Recurring Transactions in Ledger.

The design takes the useful part of FinBodhi's recurring model, but extends it to support creating recurring rules directly from Ledger.

---

# 1. Goal

Ledger should allow users to define recurring transaction patterns.

There are **two entry points**:

1. **Make recurring from an existing transaction**
2. **Create a recurring rule manually**

The first is the primary and easiest workflow.

---

# 2. Recurring Rule Model

A recurring rule is **not a transaction**.

It is a definition containing:

```text
Recurring Rule
├── Name
├── Schedule
└── Transaction Template
```

Conceptually:

```text
Recurring Rule
      │
      ├── when → Schedule
      │
      └── what → Transaction Template
```

The rule may later be extended with transaction matching/filtering, but that is **not required for Phase 1**.

---

# 3. Create From Existing Transaction

Add **Make recurring** to the transaction row `...` menu.

Example:

```text
HDFC Bank → Home Loan Interest
₹6,976
```

Row menu:

```text
View
Edit
Split
Make recurring
Delete
```

Selecting **Make recurring** opens the recurring form with the transaction details pre-populated.

Example:

```text
Create Recurring Rule

Name
[ Home Loan Interest                         ]

Transaction

From Account
[ HDFC Bank                                  ]

To Account
[ Home Loan Interest                         ]

Amount
[ ₹6,976                                     ]

Description
[ Home Loan Interest                         ]

Schedule

Start
[ 07 Aug 2026 ]

Repeat
[ Every month ]

Day
[ 7 ]

End
[ Never ▼ ]

                         [Cancel] [Create]
```

The user can modify **any pre-populated value** before creating the rule.

The source transaction is not modified.

No transaction is created merely by creating the recurring rule.

---

# 4. Create Recurring Manually

The Recurring page should also provide:

```text
+ Add New
```

This opens the same recurring form.

Unlike `Make recurring`, fields are initially empty.

Example:

```text
Create Recurring Rule

Name
[ Credit Card Bill                         ]

Transaction

From Account
[ SBI Bank                                 ]

To Account
[ Credit Card                              ]

Amount
[ ₹32,130                                  ]

Description
[ Credit Card Bill                         ]

Schedule

Start
[ 10 Aug 2026 ]

Repeat
[ Every month ]

Day
[ 10 ]

End
[ Never ▼ ]

                         [Cancel] [Create]
```

The form should be the **same component/form model** used by `Make recurring`.

Difference:

```text
Make recurring
    ↓
Existing transaction
    ↓
Prefill form
```

versus:

```text
Recurring → Add New
    ↓
Empty form
```

---

# 5. Transaction Template

Phase 1 recurring rules should store the information required to describe the recurring transaction:

```text
From Account
To Account
Amount
Description
```

For example:

```text
From: HDFC Bank
To: Home Loan Interest
Amount: ₹6,976
Description: Home Loan Interest
```

The recurring rule is therefore capable of representing a recurring transaction **without requiring an existing transaction**.

---

# 6. Schedule

The schedule should support recurring dates using a recurrence rule model.

FinBodhi uses an RRULE-style structure. Its existing data represents, for example, a monthly recurrence on the 7th using:

```text
FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=7
```

with separate start/end values. 

Ledger should use an equivalent recurrence model rather than inventing a proprietary representation.

Phase 1 UI should support at least:

```text
Daily
Weekly
Monthly
Yearly
```

with appropriate recurrence controls.

Example:

```text
Repeat:
Every month
Day:
7
```

or:

```text
Repeat:
Every week
Day:
Monday
```

Start and end dates should be supported.

End:

```text
Never
On date
```

---

# 7. Recurring List

The Recurring page should have two views/tabs:

```text
Calendar
Rules
```

### Calendar

Shows recurring occurrences against the calendar.

Example:

```text
              AUG 2026

Sun   Mon   Tue   Wed   Thu   Fri   Sat

                         1

2     3     4     5     6     7     8
                        EMI
                        ₹15,464

9    10    11    12    13    14    15
     Credit Card
     ₹32,130
```

The calendar is a **view of recurring rules**, not a separate source of truth.

---

### Rules

Show recurring rules in a compact table.

Example:

| Name        | Next Due    | Schedule      |  Amount |
| ----------- | ----------- | ------------- | ------: |
| EMI         | 7 Sep 2026  | Monthly, 7th  | ₹15,464 |
| Credit Card | 10 Sep 2026 | Monthly, 10th | ₹32,130 |

Actions:

```text
Edit
Delete
```

Additional actions can be added later.

---

# 8. No Automatic Transaction Creation in Phase 1

Creating a recurring rule must **not automatically create ledger transactions**.

Phase 1 is about defining and displaying recurring transactions.

Do not build:

```text
Recurring rule
    ↓
Automatically create transaction
```

yet.

This keeps recurring separate from the ledger itself.

Future automation can be added explicitly later.

---

# 9. No Transaction Matching in Phase 1

FinBodhi's recurring data contains a `transactionFilter` which can identify existing transactions matching a recurring pattern. For example, its `EMI` rule uses:

```text
payee contains "EMI"
```

to associate matching transactions with the recurring rule. 

Ledger should **not implement this matching system in Phase 1**.

Do not add:

```text
Transaction Filter
Rules
Automatic matching
```

to the initial recurring implementation.

This can become a later capability.

---

# 10. Relationship With Existing Transactions

An existing transaction can be the starting point for a recurring rule.

Example:

```text
Transaction
────────────────────────────
07 Aug
HDFC Bank → Home Loan Interest
₹6,976

        ↓ Make recurring

Recurring Rule
────────────────────────────
Home Loan Interest
Monthly / 7th
₹6,976
```

The two objects remain independent.

Changing the recurring rule later must not modify the original transaction.

Changing the original transaction later must not silently modify the recurring rule.

---

# 11. Split Transactions

Do not support creating a recurring rule from a split transaction in Phase 1 unless the existing transaction model already makes this trivial.

A recurring rule represents a single transaction template.

If a split transaction is selected for `Make recurring`, either:

* disable `Make recurring`, or
* explicitly handle the complete split structure.

**Do not silently flatten a split transaction.**

---

# 12. Accounts and Instruments

Recurring transactions should use the same account/instrument references as normal transactions.

Do not create a separate account model for recurring rules.

If the transaction contains an investment instrument, use the existing transaction/posting model.

The recurring feature should not introduce another pricing or instrument abstraction.

---

# 13. UI Entry Point

On the transaction list:

```text
Transaction row
    └── ...
         ├── View
         ├── Edit
         ├── Split
         ├── Make recurring
         └── Delete
```

`Make recurring` should only appear when the transaction can validly represent a recurring transaction.

For Phase 1, a normal non-split transaction is the safe supported case.

---

# 14. Reuse

The implementation should have **one recurring form**.

Do not create separate forms for:

```text
Make recurring
```

and:

```text
Recurring → Add New
```

Instead:

```text
RecurringForm
    │
    ├── empty/default state
    │
    └── prefilled transaction state
```

This prevents the two workflows from drifting apart.

---

# 15. Phase 1 Scope

### Build now

* Recurring Rule database model
* Recurring transaction template
* Schedule / RRULE representation
* Recurring Rules list
* Recurring Calendar
* Add New recurring rule
* Make recurring from transaction
* Prefill recurring form from transaction
* Edit recurring rule
* Delete recurring rule
* Basic validation
* Support daily/weekly/monthly/yearly schedules

### Do not build now

* Automatic transaction generation
* Automatic transaction posting
* Transaction matching
* Transaction-filter engine
* Recurring detection
* AI/intelligent recurring detection
* Complex split-transaction recurring rules
* Reminder/notification system

---

# 16. Design Principle

The core distinction is:

```text
TRANSACTION
    = something that happened

RECURRING RULE
    = something that is expected/repeats
```

An existing transaction can be used to **create the rule**, but the rule is not the transaction.

That gives Ledger both workflows:

```text
Import / Manual transaction
          ↓
     Existing transaction
          ↓
      Make recurring
          ↓
     Recurring Rule
```

and:

```text
Recurring
    ↓
Add New
    ↓
Recurring Rule
```

This is the main improvement over the import-centric FinBodhi workflow.

---

## Implementation note (added when archived, 2026-08-28)

Shipped as designed, with these locked interpretations (see
`docs/07-decisions.md` ADR-035 for the full rationale):

- **§6 Schedule**: structured columns (`frequency`, `interval`,
  `by_month_day`, `by_weekday`, `start_date`, `end_date`), not a stored
  RRULE string — an opaque RRULE blob would need a parser/serializer
  dependency just to read a schedule back for the UI, for a scope this
  small. `by_month_day` clamps to the target month's length (day 31 in
  February → the 28th/29th) rather than RFC5545's "skip the month"
  behavior. Yearly has no separate Day control in the UI — it anchors on
  `start_date`'s own month/day directly.
- **§7 Recurring List**: "Next Due" (Rules tab) and every occurrence shown
  on the Calendar tab are derived on read (`nextOccurrence`/
  `occurrencesInRange`, `src/domain/recurring.ts`), never persisted or
  cached — Phase 1 has no automation to keep a cache fresh against.
- **§13/§14 UI Entry Point / Reuse**: one `RecurringForm` component serves
  all three cases (`Add New` empty state, `Make recurring` prefill, Edit)
  via optional `prefill`/`recurringRule` props, exactly as specified.
  `Make recurring` is offered only for a normal non-split, single-From
  transaction, reusing the row menu's existing Split Transaction guard.
- Interval is fixed to 1 in the UI (no "every N" stepper) — every mockup
  in this delta only ever shows "Every month"/"Every week"; the schema
  already supports arbitrary `interval`, so a control can be added later
  without a migration.
