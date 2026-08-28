# Ledger Design System & Frontend Contract

**Status:** Design direction for frontend implementation  
**Scope:** Visual language, responsive behaviour, navigation, interaction principles, and screen-level design contracts

---

## 1. Design Direction

Ledger is a personal finance application built around a strong financial ledger underneath a simple consumer-facing interface.

The design should feel:

- Minimal
- Premium
- Calm
- Precise
- Trustworthy
- Information-dense without feeling crowded
- Functional rather than decorative

Ledger should feel like a well-designed financial instrument, not a generic SaaS dashboard and not traditional accounting software.

### Reference rule

FinBodhi screenshots may be used for information hierarchy, transaction-list patterns, account navigation, data density, and interaction ideas.

Do **not** copy FinBodhi branding, exact layouts, colours, visual styling, or component styling wholesale.

Generated Ledger mockups are references for visual direction, mobile-first hierarchy, desktop navigation, dashboard composition, density, and whitespace.

References are inspiration. This document is the design contract.

---

# 2. Design Principles

## 2.1 Clarity over decoration

Every visual element should communicate information or enable an action.

Prefer hierarchy, whitespace, typography, alignment, and semantic colour over decorative gradients, heavy shadows, excessive borders, and unnecessary cards.

## 2.2 Financial information should feel trustworthy

Numbers are primary content.

Balances, transaction amounts, dates, account names, and financial states must be visually stable and easy to scan.

Use colour primarily to communicate meaning:

- Positive
- Negative
- Warning
- Destructive
- Informational
- Selected/active

Do not use colour merely for decoration.

## 2.3 Progressive disclosure

Show information needed for the current task first.

Advanced accounting detail should appear when required rather than being permanently exposed.

```text
Simple transaction entry
        ↓
basic user-facing fields
        ↓
Split / advanced mode when needed
        ↓
generic multi-posting transaction
```

## 2.4 One source of truth

The same financial fact should not appear to be maintained through competing UI models.

```text
Transactions → one transaction system
Accounts     → one account system
Postings     → one accounting representation
```

Dashboard, account pages, reports, and transaction lists are views of the same data.

## 2.5 Explicit editing

Financial data should not unexpectedly become editable.

```text
Read-only
    ↓
Edit
    ↓
Save / Cancel
```

Do not use generic click-to-edit behaviour for transaction rows.

## 2.6 Mobile is not a compressed desktop

Mobile is the primary design target.

Desktop gains space and richer layouts without changing the underlying interaction model.

Do not shrink a desktop layout until it fits mobile.

## 2.7 Density without clutter

Goal:

> High information density with low visual noise.

Use whitespace to separate concepts. Use cards selectively. Not every metric needs to become a card.

## 2.8 Consistency over novelty

Repeated patterns should behave the same everywhere:

- Account selectors
- Transaction rows
- Destructive actions
- Form validation
- Tags
- Responsive rules
- Semantic colours

## 2.9 Direct actions should be obvious

Primary actions should be visually identifiable:

```text
Add Account
Add Transaction
Save
Create
```

Secondary actions should be quieter. Destructive actions should be distinct and separated from normal actions.

## 2.10 Avoid dashboard bloat

Dashboard is a summary, not another management screen.

It should answer:

```text
What do I have?
What changed?
Where is money going?
What happened recently?
```

It should not expose every report or transaction control.

---

# 3. Visual Language

## 3.1 Base aesthetic

Use a **Flexoki-inspired** visual language.

The design should feel:

- Warm rather than sterile
- Restrained rather than colourful
- Editorial rather than corporate
- Readable rather than flashy

Flexoki is the visual foundation, not a requirement to reproduce every colour from the original palette.

## 3.2 Semantic colour tokens

Use shadcn-style semantic design tokens rather than hard-coded colours.

Core tokens:

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

Finance states:

```text
success
success-foreground
warning
warning-foreground
info
info-foreground
```

Financial meaning should use semantic tokens, not arbitrary component colours.

## 3.3 Theme modes

Support:

```text
Light
Dark
System
```

System follows the operating-system preference.

The same semantic token structure must work in all three modes.

## 3.4 Typography

Priorities:

1. Numeric readability
2. Transaction scanning
3. Clear hierarchy
4. Compact secondary information

Avoid oversized hero-metric typography.

Font families (folded in from the former `design-delta-1.md`):

- UI / Primary: Geist Sans (default for all UI text).
- Financial / Tabular: Geist Mono, only where tabular alignment improves
  scanning — do not use monospace for all financial text.
- Long-form editorial content: Literata (optional, not used for core
  application UI).
- Avoid mixing multiple fonts within the same component without clear
  purpose. Typography hierarchy should come from size, weight, spacing, and
  semantic emphasis rather than excessive font variation.

## 3.5 Icons

Use a consistent outline icon family.

Icons should reinforce meaning, remain compact, use consistent stroke weight, and never replace necessary text.

## 3.6 Borders and elevation

Prefer subtle borders and restrained elevation.

Avoid heavy shadows, strong outlines everywhere, and floating-card overload.

Hierarchy should primarily come from spacing, typography, surface contrast, and alignment.

---

# 4. Responsive Navigation

## 4.1 Desktop

Use a collapsible sidebar.

```text
Ledger

HOME
  Home

TRACK / MANAGE
  Accounts
  Transactions

INSIGHTS
  Reports

────────────────
SETTINGS / SETUP
  Settings
```

Collapsed sidebar shows icons while preserving navigation order.

Settings/Setup remains at the bottom.

## 4.2 Mobile

Do not reproduce the desktop sidebar.

Use persistent bottom navigation:

```text
Home | Track | Insights | More
```

Rules:

- Bottom navigation remains accessible.
- Current destination is clearly indicated.
- Icons have text labels.
- Keep primary destinations to four or five.
- Secondary destinations belong under `More`.
- Navigation should not consume significant vertical space.

---

# 5. Header

## Desktop

```text
Left:
Ledger
version

Right:
Profile switcher (Primary User only)
Appearance / utility controls
```

Example:

```text
Ledger v0.1.0                                          AK   ☼
```

## Mobile

Keep header compact:

```text
Ledger                         AK  ˅
v0.1.0
```

Profile switching (Primary User only) remains accessible without making the header heavy.

---

# 6. Dashboard / Home

Home is the default destination.

Primary information:

```text
Net Worth
Income
Expenses
Accounts
Spending / insights
Recent Transactions
```

Optional future sections:

```text
Upcoming
Goals
Alerts
```

Do not add sections merely to fill space.

Recommended hierarchy:

```text
Dashboard
    ↓
Net Worth
    ↓
Income / Expenses
    ↓
Accounts / Spending
    ↓
Recent Transactions
```

Dashboard components link to detailed screens.

---

# 7. Track / Accounts

Accounts are a core financial object.

Account list should make these easy to scan:

```text
Name
Balance
Tags
Category
Type / Instrument
```

Account creation/editing should use a focused form rather than a dense spreadsheet-like editor.

---

# 8. Account Detail

Recommended structure:

```text
Account Header
├── Icon
├── Name
├── Balance
├── Instrument / type
└── Actions

Transactions
```

Future account-level features may add History, Settings, or Valuation.

Do not expose empty future-feature tabs in MVP.

---

# 9. Transactions

Transactions are one of Ledger's primary screens.

## Desktop

Use a table-like layout.

Recommended columns:

```text
Date
Description
Tags
From Account
From Amount
To Account
To Amount
Actions
```

Multi-posting rows may visually group destination postings.

Underlying model remains:

```text
Transaction
    └── Postings[]
```

The table is a projection of that model.

## Mobile

Do not force a wide desktop table onto a phone.

Use compact transaction rows/cards.

Primary:

```text
Description
Date
Amount
Account / destination
```

Secondary:

```text
Tags
Additional postings
```

may be progressively disclosed.

---

# 10. Transaction Editing

Default state:

```text
Read-only
```

Explicit action:

```text
Edit
```

Then:

```text
Editable fields
Save
Cancel
```

Do not use click-any-cell-to-edit behaviour.

Reason: financial data should not be accidentally changed during normal scanning.

---

# 11. Transaction Entry

Support two user-facing modes.

## Simple mode

```text
Date
Description
From Account
Amount
To Account
Amount
Tags
```

Hide unnecessary accounting terminology.

## Split mode

```text
Source account
Source amount

Destinations[]
  Account
  Amount
```

Example:

```text
HDFC Bank ₹5,000

Food             ₹2,000
Receivables      ₹3,000
```

The UI may show the accounting relationship visually without exposing debit/credit terminology unless useful.

---

# 12. Forms

General pattern:

```text
Title
Description / context

Fields

Validation

Secondary action       Primary action
Cancel                 Save/Create
```

Avoid long multi-section forms unless genuinely required.

---

# 13. Screen Contracts

## 13.1 Add / Edit Profile

Renamed from the former "Add/Edit Family" + "Add/Edit Member" pair
(2026-08-20 User Simplification delta removed Family entirely — see
`docs/completed/2026-08-20-User-Simplification.md` — a Profile is now the
whole financial identity, matching `src/components/profile-form.tsx`).

### Fields

```text
Name
```

### Behaviour

Create ("create" mode, Primary User only, from `/profiles`): adds a new,
initially-unlinked Profile.

Edit ("edit" mode): renames an existing Profile — the only editable field.

### Rules

- Name required.
- Profile owns Accounts, Transactions and Currencies.
- No separate Profile registration/login — that's the AppUser layer
  (registration links an AppUser to a Profile, 1:1).
- A Primary User can switch between Profiles via `/profiles`; a normal
  AppUser has exactly one Profile and no switcher.

## 13.2 Add / Edit Account

### Core fields

```text
Name
Category
Account / Instrument Type
Currency
Tags
```

### Conditional fields

For instrument-backed accounts:

```text
Instrument
Instrument ID
Instrument label
```

Instrument selection comes from external/reference APIs.

Ledger does not maintain an MVP instrument catalogue.

### Rules

- Account belongs to one Profile.
- Account has one currency.
- Currency is INR in MVP.
- Account tags are inline.
- Asset instruments may reference external instrument identity.

## 13.3 Add / Edit Transaction

### Core fields

```text
Date
Description
From Account
From Amount
To Account
To Amount
Tags
```

### Split mode

```text
Source account
Source amount

Destinations[]
  Account
  Amount
```

### Rules

- Transaction belongs to one Profile through its Accounts/Postings.
- Minimum two postings.
- Transaction must balance.
- Posting/account currencies must agree in MVP.
- Tags are inline.
- Editing requires explicit Edit mode.
- Delete is hard delete.
- Delete is atomic across Transaction and Postings.

---

# 14. Tags

Tags are lightweight metadata.

Examples:

```text
Trip = Japan2026
Payment = UPILite
```

Tags are not categories.

Account category determines accounting meaning.

Tags provide alternative views/filtering:

```text
Trip = Japan2026
```

produces a view of otherwise normal transactions.

Do not introduce a tag-management screen in MVP.

---

# 15. States

Important screens should account for:

```text
Loading
Empty
Populated
Error
Editing
Saving
```

Empty states should explain the next useful action.

Avoid decorative empty-state illustrations unless they improve comprehension.

---

# 16. Feedback

Use lightweight feedback:

```text
Toast
Inline validation
Subtle status indicators
```

Avoid interrupting routine successful actions.

Destructive operations may require confirmation where accidental data loss is meaningful.

---

# 17. Data Integrity and UX

The interface must not allow an invalid ledger merely because the UI is permissive.

Client-side validation improves UX. Domain/service validation remains authoritative.

Important rules:

```text
Transaction has >= 2 postings
Transaction balances
Posting has valid accounting side
Accounts belong to same Profile
Currencies agree in MVP
```

---

# 18. Anti-patterns

Do not:

- Copy FinBodhi's visual design.
- Turn every metric into a card.
- Use decorative gradients as primary visual language.
- Overuse colour.
- Overuse icons.
- Make mobile a compressed desktop.
- Make transaction cells implicitly editable.
- Hide primary actions behind unnecessary menus.
- Expose accounting complexity unnecessarily.
- Create separate data models merely for different screens.
- Add empty future-feature navigation just to suggest breadth.
- Build dashboard widgets without clear purpose.
- Use colour alone to communicate financial state.

---

# 19. Component Philosophy

Prefer a small reusable component vocabulary:

```text
AppShell
Header
Sidebar
BottomNav
PageHeader
Metric
Card
DataTable
TransactionList
TransactionRow
AccountList
AccountRow
Tag
TagInput
AccountSelector
DateSelector
MoneyInput
FormField
EmptyState
ConfirmDialog
```

Components should encode design-system behaviour, not individual screen styling.

---

# 20. Responsive Component Principle

Same domain data, different presentation.

Example:

```text
TransactionList
├── Desktop → table
└── Mobile  → compact rows/cards
```

Do not maintain separate business logic for desktop and mobile.

Responsive presentation is a UI concern.

---

# 21. Design Review Checklist

### Visual

- Minimal?
- Premium without ornament?
- Clear hierarchy?
- Intentional whitespace?
- Financial numbers easy to scan?
- Semantic colours consistent?

### Interaction

- Primary action obvious?
- Editing explicit?
- Destructive actions clear?
- Progressive disclosure used?

### Mobile

- Natural at phone width?
- Bottom navigation accessible?
- Important actions reachable?
- Appropriate density?
- Horizontal scrolling avoided unless genuinely useful?

### Desktop

- Sidebar useful?
- Sidebar collapsible?
- Extra width improves information density?

### Consistency

- Existing components reused?
- Semantic tokens used?
- Existing interaction patterns followed?
- Domain model respected?

---

# 22. Design Authority

Use this priority when implementing frontend work:

```text
Domain / architecture docs
        ↓
Accepted delta changes
        ↓
This design contract
        ↓
Screen-specific requirements
        ↓
Reference mockups
        ↓
Implementation preference
```

Reference screenshots should never override the domain model.

Reference mockups should never be copied literally.

The goal is a coherent Ledger design system, not a collection of individually attractive screens.
