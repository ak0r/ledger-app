# Ledger — Screen Contracts

**Status:** Implementation change note  
**Scope:** Mobile-first UI contracts  
**Relationship to v9:** Supplements existing v9 documentation. Do not rewrite or renumber v9 docs because of this file.

---

## 1. Product UI principles

Ledger is **mobile-first**.

Desktop is a responsive expansion of the mobile experience, not a separate product.

Core principles:

- Keep accounting complexity behind simple consumer-facing controls.
- Use explicit Add/Edit actions.
- Prefer clear forms over dense accounting terminology.
- Use inline editing where useful, but never make editing ambiguous.
- Preserve one reusable TransactionList across transaction contexts.
- Use semantic design tokens rather than hardcoded colors.
- Support Light, Dark, and System appearance modes.
- Settings screens are deferred.

---

# 2. Navigation model

Current MVP navigation should remain focused.

```text
Home / Dashboard
Track
├── Transactions
└── Accounts
    └── Account Detail
```

Setup/profile management may expose:

```text
Family
Members
```

Spaces remain a later module.

Settings are explicitly **not part of this screen-contract set**.

---

# 3. Family — Add / Edit

## Purpose

Create or rename the local family/container.

## Fields

| Field | Required | Input |
|---|---:|---|
| Name | Yes | Text |

Example:

```text
Family name
[Amit's Family]
```

## Mobile layout

```text
┌─────────────────────────┐
│ ← Add Family            │
│                         │
│ Family name             │
│ ┌─────────────────────┐ │
│ │ Amit's Family       │ │
│ └─────────────────────┘ │
│                         │
│                         │
│ [       Create       ]  │
└─────────────────────────┘
```

## Edit

Same screen.

Title changes to:

```text
Edit Family
```

Primary action:

```text
Save
```

## Validation

- Name required.
- Trim whitespace.
- Do not allow empty name.

---

# 4. Member — Add / Edit

## Purpose

Create a person/profile within the local family.

## Fields

| Field | Required | Notes |
|---|---:|---|
| Name | Yes | Display name |

DOB is **not part of MVP**.

## Mobile layout

```text
┌─────────────────────────┐
│ ← Add Member            │
│                         │
│ Name                    │
│ ┌─────────────────────┐ │
│ │ PK                  │ │
│ └─────────────────────┘ │
│                         │
│ [       Create       ]  │
└─────────────────────────┘
```

## Edit

Same form with:

```text
Save
```

## Important boundary

Member represents identity/ownership.

Do not put Space roles such as Admin or Splitter on Member.

Those roles belong to Space membership when Spaces are implemented.

---

# 5. Account — Add / Edit

## Purpose

Create an accounting account owned by the active member.

## Fields

| Field | Required | Notes |
|---|---:|---|
| Name | Yes | Account display name |
| Category | Yes | Assets, Liabilities, Income, Expenses, Balancing |
| Account Type | Yes | Depends on category |
| Currency | Yes | MVP default INR |
| Tags | No | Inline `string[]` |
| Tax Rule | No | Optional |
| Instrument | Conditional | Required/available for instrument-backed account types |

## Category

Use:

```text
Assets
Liabilities
Income
Expenses
Balancing
```

Do **not** call the category Equity.

## Account Type

Account Type is distinct from Category.

Examples include:

```text
Cash
Stock
Metal
```

Exact MVP enum remains governed by v9 domain decisions.

## Conditional fields

### Currency account

Show:

```text
Currency
[ INR ▼ ]
```

### Stock account

Show:

```text
Instrument
[ Search instrument... ]
```

### Metal account

Show:

```text
Instrument
[ Gold 999 ▼ ]
```

Do not expose irrelevant fields.

## Mobile layout

```text
┌─────────────────────────┐
│ ← Add Account           │
│                         │
│ Name                    │
│ [ HDFC Bank           ] │
│                         │
│ Category                │
│ [ Assets              ] │
│                         │
│ Account Type            │
│ [ Cash                ] │
│                         │
│ Currency                │
│ [ INR                 ] │
│                         │
│ Tags                    │
│ [ + Add tag            ] │
│                         │
│ Tax Rule                │
│ [ None                ] │
│                         │
│ [       Create        ] │
└─────────────────────────┘
```

## Edit

Same form.

Use:

```text
Save
```

Do not expose:

```text
id
memberId
createdAt
updatedAt
deleted state
internal instrumentId
```

unless required through an appropriate selector.

---

# 6. Transaction — Add

## Purpose

Create a balanced double-entry transaction without forcing the user to understand debit/credit mechanics.

## Modes

Two modes:

```text
Simple
Split
```

Default:

```text
Simple
```

---

## 6.1 Simple transaction

### Fields

| Field | Required |
|---|---:|
| Date | Yes |
| Description | Yes |
| From Account | Yes |
| Amount | Yes |
| To Account | Yes |
| Tags | No |

Future:

```text
Space
```

Space is deferred until Space module implementation.

### Mobile layout

```text
┌─────────────────────────┐
│ ← Add Transaction       │
│                         │
│ [ Simple ] [ Split ]    │
│                         │
│ Date                    │
│ [ 13 Aug 2026         ] │
│                         │
│ Description             │
│ [ Ginza Dinner        ] │
│                         │
│ From                    │
│ [ HDFC Bank           ] │
│                         │
│ Amount                  │
│ [ ₹ 5,000              ]│
│                         │
│ To                      │
│ [ EatingOut            ] │
│                         │
│ Tags                    │
│ [ + Add tag            ] │
│                         │
│ [       Add          ]  │
└─────────────────────────┘
```

Internally:

```text
HDFC Bank     -5000
EatingOut     +5000
```

Do not expose debit/credit fields in Simple mode.

---

# 7. Transaction — Split

## Purpose

Support the common one-source-to-many-destination transaction.

## Fields

Same base fields:

```text
Date
Description
From Account
Amount
Tags
```

Then:

```text
Destinations
```

Example:

```text
From
HDFC Bank

Amount
₹5,000

Destinations

EatingOut             ₹2,500
Receivables           ₹2,500

Total                 ₹5,000
```

## Validation

Destination total must equal source amount.

```text
sum(destinations) == source amount
```

Cannot save while unbalanced.

## Mobile layout

```text
┌─────────────────────────┐
│ ← Add Transaction       │
│                         │
│ [ Simple ] [ Split ]    │
│                         │
│ Date                    │
│ [ 13 Aug 2026         ] │
│                         │
│ Description             │
│ [ Ginza Dinner        ] │
│                         │
│ From                    │
│ [ HDFC Bank           ] │
│                         │
│ Amount                  │
│ [ ₹ 5,000              ]│
│                         │
│ Destinations            │
│                         │
│ EatingOut       ₹2,500  │
│ Receivables     ₹2,500  │
│                         │
│ [+ Add destination]     │
│                         │
│ Total           ₹5,000  │
│                         │
│ Tags                    │
│ [ + Add tag            ] │
│                         │
│ [       Add          ]  │
└─────────────────────────┘
```

---

# 8. Transaction — Edit

Add and Edit use the same form contract.

Title:

```text
Edit Transaction
```

Primary action:

```text
Save
```

Cancel must discard unsaved changes.

## Important

Editing is transaction-level mutation.

The UI must not directly mutate individual posting records without loading and validating the complete transaction.

---

# 9. Transaction List

## Purpose

Reusable transaction projection used across contexts.

Contexts:

```text
Member / global transaction view
Account detail
Future Space view
```

One component:

```text
TransactionList
```

No separate AccountTransactionList.

---

# 10. Transaction List — Mobile

Mobile should prioritize the information users need to identify a transaction.

Suggested row:

```text
┌─────────────────────────┐
│ 13 Aug                  │
│ Ginza Dinner            │
│ HDFC Bank → EatingOut   │
│              ₹5,000    │
└─────────────────────────┘
```

For split transaction:

```text
┌─────────────────────────┐
│ 13 Aug                  │
│ Ginza Dinner            │
│ HDFC Bank →             │
│   EatingOut      ₹2,500 │
│   Receivables    ₹2,500 │
│              ₹5,000     │
└─────────────────────────┘
```

Tags can appear as compact chips where space permits.

Avoid forcing the full desktop table into a narrow mobile viewport.

---

# 11. Transaction List — Desktop

Desktop can use a dense table.

Recommended columns:

```text
Date
Description
Tags
From Account
From Amount
Direction
To Account
To Amount
Actions
```

One transaction remains one logical row.

Multi-posting destinations may stack inside the To Account / To Amount area.

Example:

```text
Date       Description    From       Amount    To
─────────────────────────────────────────────────────
13 Aug     Ginza Dinner   HDFC Bank   ₹5,000   EatingOut     ₹2,500
                                                 Receivables   ₹2,500
```

---

# 12. Transaction List — Editing

## Important decision

Transaction rows are **not click-to-edit**.

Normal state is read-only.

Editing is explicitly enabled through an **Edit** action.

Example:

```text
[ Edit ]
```

or:

```text
[ Edit mode ]
```

Once enabled:

```text
┌─────────────────────────────────────┐
│ Edit mode                            │
│                                     │
│ editable cells become visibly       │
│ editable                             │
│                                     │
│             [Cancel] [Save changes] │
└─────────────────────────────────────┘
```

## Why

Avoid accidental edits.

A financial transaction list should feel stable until the user explicitly chooses to modify data.

---

# 13. Inline edit mode

Inline editing is allowed **only inside explicit edit mode**.

Suitable fields:

```text
Date
Description
Tags
Account
Amount
```

Complex split restructuring should open the full transaction editor.

## Edit mode rules

- Show clear editable affordances.
- Keep row identity stable.
- Preserve unsaved changes locally.
- Cancel restores original values.
- Save validates all changed transactions before persistence.
- Invalid rows must be clearly identified.
- Persistence should be atomic where multiple fields belong to one transaction.
- Do not write partial invalid accounting state.

---

# 14. Transaction List actions

Normal row actions may include:

```text
Edit
Delete
```

Additional actions can be added later.

Delete remains **hard delete**.

No history/audit UI in MVP.

---

# 15. List states

Every list screen needs:

### Loading

Use skeleton rows rather than an empty table.

### Empty

Example:

```text
No transactions yet.

Add your first transaction.
```

### Error

Example:

```text
Could not load transactions.

[ Try again ]
```

### Filtered empty

Differentiate:

```text
No transactions match these filters.
```

from:

```text
No transactions yet.
```

---

# 16. Form states

Every Add/Edit screen should support:

```text
Initial
Editing
Saving
Validation error
Persistence error
Success
```

While saving:

- disable duplicate submission
- preserve entered values
- show progress on primary action

On validation failure:

- keep form open
- identify field-level errors
- do not clear valid fields

---

# 17. Responsive strategy

## Mobile first

Primary layout target:

```text
~320–430 px viewport
```

Design for one-handed interaction where practical.

## Desktop

At wider widths:

- forms may use a centered constrained panel
- transaction list becomes a table
- more columns become visible
- navigation can expand
- dense information is acceptable

Do not create separate desktop and mobile business logic.

Same domain model.
Same query layer.
Same mutation services.

Only presentation changes.

---

# 18. Touch and accessibility

Use accessible controls and comfortable touch targets.

Guidelines:

- minimum practical touch target around 44 × 44 px
- visible keyboard focus
- labels associated with inputs
- do not rely only on color to communicate state
- sufficient text/background contrast
- errors have text, not only red borders
- destructive actions require clear intent
- keyboard navigation must remain usable on desktop

---

# 19. Design system

## Direction

Use:

**shadcn/ui semantic token model + Flexoki-inspired visual theme**

The application should use semantic tokens such as:

```text
background
foreground

card
card-foreground

popover
popover-foreground

primary
primary-foreground

secondary
secondary-foreground

muted
muted-foreground

accent
accent-foreground

destructive
destructive-foreground

border
input
ring
```

Do not hardcode component colors.

---

# 20. Flexoki theme

Visual direction should be inspired by Flexoki:

- warm paper-like light surfaces
- warm near-black dark surfaces
- restrained accent colors
- muted, readable secondary text
- low-saturation semantic colors
- strong readability
- minimal visual noise

Flexoki is a **visual direction**, not a requirement to copy another application's UI.

Use semantic tokens so the theme can evolve without rewriting components.

---

# 21. Appearance modes

Support:

```text
Light
Dark
System
```

Default:

```text
System
```

unless existing application preferences dictate otherwise.

Components must consume semantic tokens.

Do not write:

```css
background: #...
color: #...
```

inside individual components where a semantic token is appropriate.

---

# 22. Semantic financial colors

Financial meaning should also use semantic tokens.

Suggested semantic concepts:

```text
positive
negative
warning
info
```

Examples:

```text
positive → income / favourable balance
negative → expense / liability movement
warning  → validation / attention
info     → neutral informational state
```

Do not rely on red/green alone.

Icons, labels, signs, and text should reinforce meaning.

---

# 23. Account category colors

Account category can have a semantic visual identity, but it must remain subtle.

```text
Assets
Liabilities
Income
Expenses
Balancing
```

The exact color assignment should live in the theme/token layer.

Do not scatter category colors through components.

---

# 24. Mobile navigation

Keep primary navigation shallow.

Likely top-level areas:

```text
Home
Track
```

Additional areas can appear as modules mature.

Do not expose deferred Settings screens.

---

# 25. Screen relationships

```text
Family
  └── Members
       ├── Member
       │    ├── Accounts
       │    └── Transactions
       │
       └── Member
            ├── Accounts
            └── Transactions

Transactions
    └── TransactionList
          ├── Member scope
          ├── Account scope
          └── Space scope (future)
```

Account detail:

```text
Account
  ├── account summary
  └── TransactionList(scope=account)
```

---

# 26. Explicit non-goals

These screen contracts do not define:

- Settings
- Preferences
- Backup
- Import UI
- Email import UI
- History/audit UI
- Sharing UI
- Space management UI
- Settlement UI
- Investment dashboards
- Recurring transaction UI
- Planning/budgeting UI

Those remain separate modules/contracts.

---

# 27. Implementation guardrails

Do not let UI implementation change domain architecture.

Specifically:

- TransactionList is not a database entity.
- Account pages reuse TransactionList.
- Tags remain inline `string[]` (simple opaque tags, not key/value).
- Accounts remain member-owned.
- Transactions remain member-owned.
- Postings remain the accounting source of truth.
- Hard delete remains MVP behaviour.
- No audit/history implementation.
- No Space implementation yet.
- No normalized tag model.
- No direct DB writes from components.
- No accounting rules inside table cell renderers.

---

# 28. Screen contract summary

```text
FAMILY
------
name


MEMBER
------
name


ACCOUNT
-------
name
category
accountType
currency
instrument       [conditional]
tags
taxRule


TRANSACTION
-----------
date
description
fromAccount
amount
toAccount        [simple]
destinations[]   [split]
tags
space            [future]


TRANSACTION LIST
---------------
read-only by default
explicit Edit mode
inline editing in Edit mode
Save / Cancel
reusable across contexts
mobile-first
desktop table at larger widths
```

---

# 29. Core UI principle

> **Stable by default. Explicit when editing. Simple on the surface. Double-entry underneath.**

The user should see a familiar finance app.

The implementation should preserve the ledger's accounting guarantees.
