# UI Principles

## General

Mobile-first web application.

UI should hide accounting complexity while preserving accounting correctness.

## Profile context

Renamed from "Member" (2026-08-20 User Simplification delta). Every route
is scoped to one Profile (`/p/[profileId]/...`).

Show the active Profile clearly (name, and a switcher for the Primary User,
who can access every Profile in the Hosted Instance via `/profiles`).

Switching Profile changes the working scope of:

- Accounts
- Transactions
- Currencies
- Reports

AppUser login/session is real authentication now — a normal AppUser has
exactly one Profile and never sees a switcher.

## Transaction entry

Users should not need to understand debit/credit.

### Simple mode

For common two-leg transactions:

```text
Date          20-Apr-2026
Description   Ginza Dinner

From          HDFC Credit Card
Amount        ₹5,000

To            Food

[Save]
```

System creates:

```text
Food Expense       DEBIT   ₹5,000
Credit Card        CREDIT  ₹5,000
```

### Split mode

Explicit action:

```text
+ Split
```

Then:

```text
Date          20-Apr-2026
Description   Ginza Dinner

From          HDFC Credit Card
Amount        ₹5,000

To:
  Food                    ₹2,000
  Receivable              ₹3,000

Total                     ₹5,000
                           ✓ Balanced

[Save]
```

MVP can prioritize one-source-to-many-destination entry.

The underlying domain must support generic N-posting transactions.

### Validation

Show:

- missing account
- missing amount
- invalid posting
- unbalanced split

Do not expose raw debit/credit errors unless useful for an advanced/debug view.

## Transaction list

Spreadsheet-like.

Useful fields:

- Date
- Description
- Account(s)
- Amount
- Type
- Tags

Filters (within one Profile's scope — Profile itself isn't a filter, it's
already the whole view):

- date
- Account
- classification
- tag key
- tag value

## Tags

Display as chips:

```text
[trip: Japan2026] [payment: UPILite]
```

Support:

- add
- edit
- remove
- search
- filter

Editing a tag changes only the current record.

## Accounts

Show:

- name
- classification
- instrument type
- currency
- balance
- tags
- archive state

## Dashboard

MVP:

- account balances
- net position where meaningful
- income
- expenses
- recent transactions

## Reports

Basic:

- income
- expenses
- account balances
- transaction trends
- tag-filtered views

## History — future

Reuse transaction-entry component in frozen/read-only mode.

States:

- green: added
- yellow: modified
- red: deleted

No history implementation in MVP.
