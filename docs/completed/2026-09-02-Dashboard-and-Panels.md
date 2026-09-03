# Delta: Dashboard and Panels

## Status

**Decision: Locked for implementation. Shipped 2026-09-02** — see the
implementation note at the end of this file, ADR-037 in
`docs/07-decisions.md`, and `docs/04-modules.md`.

This delta introduces the Dashboard framework and configurable Dashboard Panels.

The Homepage is the default Dashboard for the currently active Profile.

---

# 1. Scope

This delta covers:

- Profile-scoped Dashboards
- Default Dashboard behaviour
- Starter Dashboard creation
- Dashboard Panel persistence
- Panel registry/catalogue
- Fixed-size Bento/grid layout
- Drag-and-drop panel placement
- Panel add, configure and remove interactions
- Runtime-derived panel data
- Initial Dashboard panels supported by current Ledger capabilities

This delta does not cover:

- Investment valuation panels
- Portfolio Value
- Portfolio NAV
- Recent Investments
- User-resizable panels
- Separate mobile layouts
- Persisted financial facts or dashboard aggregates

---

# 2. Ownership and Scope

```text
AppUser
  └── Profile
        └── Dashboard
              └── DashboardPanel
```

A Dashboard belongs to a Profile. A Dashboard Panel belongs to a Dashboard.

The Profile boundary is the financial data boundary for every panel. Panels must only query financial entities belonging to the Dashboard Profile and must never aggregate across Profiles.

## Profile switching

```text
Active Profile changes
        ↓
Resolve Profile's default Dashboard
        ↓
Render that Dashboard and its Panels
```

---

# 3. Homepage

The Homepage is the default Dashboard for the active Profile.

```text
Homepage
    =
Default Dashboard
for
Active Profile
```

The Homepage does not own a separate financial summary model. It renders the Dashboard.

---

# 4. Dashboard Count

Phase 1 supports one default Dashboard per Profile.

The data model should allow multiple Dashboards in the future, with one marked as default.

Current behaviour:

```text
Profile
    └── One Default Dashboard
```

Future expansion may allow:

```text
Profile
├── Overview          ← default
├── Investments
└── Travel
```

Multiple Dashboard management is out of scope for this delta.

---

# 5. Dashboard Creation and Starter Dashboard

A Dashboard must be created automatically for a new Profile.

Each new Profile receives a Starter Dashboard containing:

## Cards

- Net Worth
- Assets
- Liabilities

## Lists

- Balances
- Recent Expenses
- Recent Transactions

Starter panels are ordinary DashboardPanel instances. The user can move, configure, remove, and add panels.

No starter panel is permanently required.

---

# 6. DashboardPanel Architecture

A DashboardPanel is a persisted panel instance.

It stores only:

- Panel identity/type
- Panel configuration
- Actual placement

Conceptually:

```text
DashboardPanel

id
dashboardId

key
configuration

x
y

createdAt
updatedAt
```

The exact database naming may follow existing project conventions.

## Do not store

Panels must not persist:

- Account balances
- Net worth
- Asset totals
- Liability totals
- Expense totals
- Transaction results
- Chart data
- Other derived financial facts

Panels are views over current Ledger data.

---

# 7. Runtime Data Principle

```text
Stored Panel Definition
        +
Panel Configuration
        +
Dashboard Profile
        +
Current Ledger Data
        ↓
Runtime Query
        ↓
Panel Result
        ↓
Render
```

The persisted Panel contains configuration and layout only.

The Ledger remains the source of financial facts.

---

# 8. Panel Registry

Panel behaviour is defined by an application-level Panel Registry.

The database stores the panel `key`. The registry defines the panel implementation.

Each registry entry should define, as applicable:

```text
key
name
description
category
fixed grid dimensions
configuration schema
default configuration
rendering component
```

The registry is the source of truth for available panel types, fixed dimensions, configuration requirements, and rendering implementation.

DashboardPanel records must not define arbitrary panel behaviour.

---

# 9. Panel Categories

The initial catalogue is organised into:

```text
Cards
Lists
Charts
```

Charts remain a future category for this delta. Investment-dependent panels are excluded until valuation exists.

---

# 10. Initial Panel Catalogue

## Cards

### Net Worth

Shows the current Profile's runtime-derived Net Worth.

```text
Assets
-
Liabilities
=
Net Worth
```

No user configuration is required initially.

### Assets

Shows runtime-derived total Assets for the Dashboard Profile.

No user configuration is required initially.

### Liabilities

Shows runtime-derived total Liabilities for the Dashboard Profile.

No user configuration is required initially.

## Lists

### Balances

Shows balances for explicitly configured Profile accounts.

A newly added Balances panel has:

```text
No account selection
```

This is intentionally different from:

```text
All accounts
```

Configuration supports:

```text
Account Scope

○ All accounts

○ Selected accounts
```

When Selected accounts is chosen, the user selects Profile accounts.

Example:

```text
☑ HDFC Savings
☑ ICICI Savings
☐ Cash
```

If no scope/configuration has been selected, the panel remains visible and shows an appropriate configuration state:

```text
No accounts selected

[ Configure Panel ]
```

The panel must not silently interpret an empty configuration as All accounts.

### Recent Expenses

Shows Expense Account totals for a selected period.

It is an expense aggregation view, not a raw transaction list.

Expected presentation:

```text
Expense Account
Amount
Relative horizontal bar
```

Example:

```text
Food            ₹18,000   █████████
Transport        ₹8,000   ████
Shopping         ₹6,000   ███
```

Results are derived at runtime from Profile-scoped Ledger data.

### Recent Transactions

Shows the most recent transactions for the Dashboard Profile.

Initial default:

```text
20 transactions
```

Results are runtime-derived.

---

# 11. Explicitly Excluded Panels

The following are excluded until the Instrument/Valuation model supports them:

- Recent Investments
- Portfolio Value
- Portfolio NAV

They must not be implemented as placeholders in this delta.

---

# 12. Duplicate Panel Types

Duplicate panel types are allowed.

Each DashboardPanel is an independent instance.

Example:

```text
Balances Panel 1
→ HDFC Savings
→ ICICI Savings

Balances Panel 2
→ Cash
→ Wallet
```

Likewise:

```text
Recent Expenses Panel 1
→ Current Month

Recent Expenses Panel 2
→ Current Year
```

The Dashboard must not enforce uniqueness of panel keys.

---

# 13. Layout

The Dashboard uses a Bento-style grid layout.

Panels are:

- Movable
- Drag-and-drop enabled
- Fixed-size
- Not user-resizable

```text
User controls:
x
y

Panel Registry controls:
width
height
```

---

# 14. Fixed Panel Dimensions

Panel dimensions are defined by the Panel Registry.

Dimensions may be represented internally as grid units, for example:

```text
width: 1
height: 1
```

or:

```text
width: 2
height: 2
```

Exact dimensions should produce a coherent Bento layout.

Panel dimensions must not be persisted as user-editable state.

---

# 15. Panel Placement

Actual panel placement is persisted.

Store placement coordinates rather than only a sequential sort order:

```text
x
y
```

When a panel is moved:

```text
Drag
    ↓
Drop
    ↓
Persist resulting placement
```

No separate Save Layout action is required.

---

# 16. Responsive Behaviour

Only one user-defined layout is stored.

There are no separate:

- Mobile placements
- Tablet placements
- Breakpoint-specific layouts

The stored layout is automatically adapted responsively by the UI.

The user does not configure separate mobile reflow.

---

# 17. Panel Hover Controls

Panels remain visually clean in their normal state.

On hover, a panel receives a visible frame and a small header/control area.

Controls:

```text
Drag handle
Edit / Configure
Remove
```

Conceptually:

```text
┌────────────────────────────────┐
│ ⋮⋮ Panel Name           ⚙  ✕   │
├────────────────────────────────┤
│                                │
│         Panel Content          │
│                                │
└────────────────────────────────┘
```

The exact visual design should follow the existing Ledger design system.

---

# 18. Panel Removal

Removing a panel is immediate.

There is:

- No confirmation dialog
- No mandatory undo workflow

Removal deletes the DashboardPanel instance only.

It does not affect Accounts, Transactions, Postings, or other Ledger data.

The panel type remains available in the Panel Catalogue and can be added again.

---

# 19. Add Panel Experience

The Dashboard provides:

```text
[ + Add Panel ]
```

This opens the Panel Catalogue grouped by:

```text
Cards
Lists
Charts
```

Selecting a panel:

```text
Select panel
    ↓
Create DashboardPanel
with default configuration
    ↓
Place into Dashboard
```

The user configures the panel later.

Adding a panel should not force the configuration modal to open.

---

# 20. Default Configuration

Panels are added with their default configuration.

Default configuration must not silently select financial entities unless explicitly defined for that panel.

For account-selection panels:

```text
No selection
```

is a valid initial state.

For Balances, the user explicitly chooses:

```text
All accounts
```

or:

```text
Selected accounts
```

---

# 21. Panel Configuration

Panel configuration opens in a Modal.

Conceptually:

```text
Configure <Panel Name>

[ Panel-specific controls ]

[ Cancel ] [ Save ]
```

Example:

```text
Configure Balances

Account Scope

○ All accounts

○ Selected accounts

  ☑ HDFC Savings
  ☑ ICICI Savings
  ☐ Cash

[ Cancel ] [ Save ]
```

Each panel type owns its configuration UI according to its registry definition.

---

# 22. Configuration Validation

Panel configuration must be validated according to Panel type.

The Panel Registry should define a configuration schema or equivalent validation contract.

```text
Panel key
    ↓
Panel-specific configuration validation
```

Configuration references must be valid within the Dashboard Profile scope.

For example, an account ID configured for a Panel must belong to the Dashboard's Profile.

---

# 23. Empty States

Empty panels remain visible.

A panel must never automatically disappear because its runtime query has no results.

Examples:

```text
Balances
→ No accounts selected

Recent Transactions
→ No transactions yet

Recent Expenses
→ No expenses for this period
```

Empty state is a valid panel state.

---

# 24. Panel Loading

Panel content is derived from current data.

The Dashboard framework should allow individual panels to load/render independently where supported by the application architecture.

A slow or data-heavy panel should not unnecessarily block the entire Dashboard shell.

Expected principle:

```text
Dashboard shell
    ↓
Individual panel loading states
    ↓
Panel content as available
```

---

# 25. Data Scope Rules

Every Dashboard Panel query must be scoped through:

```text
Dashboard
    ↓
Profile
```

The Profile boundary must be applied before panel-specific filtering.

```text
Dashboard Profile
    ↓
Profile-owned financial data
    ↓
Panel configuration/filter
    ↓
Panel result
```

Never query all application data and attempt to filter later.

---

# 26. Data Model Summary

```text
AppUser
    │
    └── Profile
            │
            └── Dashboard
                    │
                    └── DashboardPanel
```

Conceptual Dashboard fields:

```text
id
profileId
name
isDefault
createdAt
updatedAt
```

Conceptual DashboardPanel fields:

```text
id
dashboardId
key
configuration
x
y
createdAt
updatedAt
```

Panel dimensions are supplied by the Panel Registry and are not stored per user instance.

---

# 27. Core Architectural Principle

The Dashboard is a UI composition layer.

It is not a financial data store.

Persist:

```text
Dashboard identity
Panel type
Panel configuration
Panel placement
```

Derive at runtime:

```text
Balances
Net Worth
Assets
Liabilities
Expense totals
Transaction lists
Other financial facts
```

The Ledger remains the source of truth.

---

# 28. Final Behaviour Summary

```text
AppUser switches Profile
        ↓
Active Profile changes
        ↓
Load Profile's default Dashboard
        ↓
Load DashboardPanel instances
        ↓
Panel Registry resolves each panel type
        ↓
Validate panel configuration
        ↓
Query current Profile-scoped data
        ↓
Render current runtime facts
```

The user can:

```text
Add panels
Move panels
Configure panels
Remove panels
Add duplicate panel types
```

The user cannot:

```text
Resize panels
Create separate mobile layouts
Persist financial facts inside panels
```

---

# 29. Future Expansion

The Dashboard architecture supports future Panel Registry entries without redesigning the framework.

Possible future panels:

```text
Budgets
Goals
Plans
Insights
Recent Investments
Portfolio Value
Portfolio NAV
```

These remain future work unless their underlying domain model is implemented.

---

## Implementation note (added when archived, 2026-09-02)

Shipped as designed, with these locked interpretations (see
`docs/07-decisions.md` ADR-037 for the full rationale):

- **§5 Starter Dashboard vs §10/§29 catalogue**: the Starter Dashboard
  created automatically for every new Profile
  (`createStarterDashboard`, `src/server/use-cases/dashboards.ts`) is
  exactly the 6 panels §5 lists — Net Worth/Assets/Liabilities/Balances/
  Recent Expenses/Recent Transactions, nothing more. A 7th panel key,
  Budgets Needing Review, was added to the *catalogue* only (available via
  "+ Add Panel," not part of the starter set) — §29 frames excluded panels
  as "future work unless their underlying domain model is implemented,"
  and Budgets' domain model had already shipped
  (`docs/completed/2026-09-01-Budget-Framework.md`) by the time this delta
  was built. It also carries over the Home page's own pre-existing
  hardcoded "Budgets needing review" card as a real Panel instead of
  losing that behaviour when the Homepage became Dashboard-driven — a
  decision made explicitly with the user before implementation, not a
  silent scope add.
- **§8 Panel Registry**: split into two files rather than one, since the
  registry's "rendering component" field can't live in the same module as
  its data (domain must not depend on React, `docs/06-architecture.md`,
  and every panel component reads the database directly, which can't be
  bundled for the browser). `domain/dashboard.ts` holds the client-safe
  half (name/description/category/dimensions/which keys have
  configuration); `src/lib/panel-registry.tsx` holds the server-only
  rendering half, imported only from Server Components.
- **§13/§15 Drag-and-drop**: implemented with `@dnd-kit/core` (this
  delta's only new runtime dependency — no existing library in this
  codebase covered accessible drag/collision/placement) plus a pure,
  dnd-kit-free collision resolver (`resolveDrop`,
  `src/lib/dashboard-grid-layout.ts`) so the placement rule is unit
  tested without a DOM. The rule itself is a deliberately narrow
  heuristic the delta doesn't specify: an empty target always succeeds; a
  target fully covered by exactly one same-dimensions panel swaps with
  it; anything else (partial overlap, multiple panels in the way,
  mismatched sizes) is rejected outright rather than attempting a general
  reflow.
- **§14 Fixed dimensions**: Cards are 1x1, Lists are 2x2 in a 4-column
  grid (`PANEL_DIMENSIONS_BY_KEY`, `domain/dashboard.ts`) — the delta
  gives example unit shapes but never mandates exact sizes; this is this
  implementation's own choice for a coherent Bento layout.
- **§17 Hover controls**: taken literally — panels show no name/controls
  at all until hover (a `group`/`group-hover` CSS pattern), which means
  there's currently no touch/mobile-friendly fallback for the panel name
  becoming visible without a hover state. Not addressed here (§16
  explicitly excludes designing separate mobile layouts); flagged as a
  known gap for a future pass, not a silent omission.
- **§5's Starter Dashboard creation** hooks into both of this codebase's
  Profile-creation paths (`registerAppUser` in `use-cases/auth.ts`,
  `createProfile` in `use-cases/profiles.ts`) inside their existing
  transactions. Every Profile that predates this delta gets its Starter
  Dashboard lazily, the first time `getDefaultDashboardWithPanels` is
  called for it, rather than a one-time backfill migration — the same
  posture `src/server/db/client.ts` already takes against eager
  migrations on every boot, applied one level up.
- **§21/§22 doesn't fully enumerate Recent Expenses' period options**
  beyond a "Current Month"/"Current Year" worked example — This Month/
  This Year/All Time (`RECENT_EXPENSES_PERIODS`, `domain/dashboard.ts`)
  is this implementation's own interpretation.
