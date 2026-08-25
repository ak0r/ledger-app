# Delta Change — 2026-08-18

> Additive build-context delta for Ledger. This does **not** replace or rewrite v9 documents.

## 1. Product direction

Ledger is now treated as a polished product, not only an MVP.

Principles:
- Mobile-first.
- Minimal, premium, information-dense without bloat.
- Consistent interaction patterns.
- Reusable components and services.
- Shadcn UI components with semantic tokens.
- Flexoki-inspired colour system.
- Geist Sans for UI/text.
- Geist Mono for financial numbers.
- Light / Dark / System themes.

## 2. Transaction list

Desktop remains table-oriented with:

1. Selection checkbox
2. Date
3. Description
4. Tags
5. From Account
6. From Amount
7. Posting direction
8. To Account
9. To Amount
10. Actions

Selection is required for future/current bulk operations.

### Row actions

At right end:
- Quick Edit icon: enables inline editing.
- `...` menu: further actions.

Quick Edit is desktop-only. Mobile has no quick-edit icon.

`...` should include, where applicable:
- View transaction
- Edit
- Split transaction
- Merge transactions
- Delete

Every menu item has icon + label.

## 3. Desktop inline editing

Normal rows are read-only. Clicking arbitrary cells does not enter edit mode.

Clicking the edit icon enables row-level quick edit:
- Preserve table layout where possible.
- Use appropriate controls for editable values.
- Validate before save.
- Provide Save / Cancel.
- Escape should cancel where practical.

`... → Edit` opens a modal/dialog rather than navigating to a separate edit page.

## 4. Mobile editing

Mobile is not a compressed desktop table.

Use a compact transaction row/card showing approximately:
- Date
- Description
- Amount
- Compact from/to account or posting summary

Secondary metadata such as tags can be compact.

Mobile edit uses a modal/dialog or responsive sheet. No quick-edit icon.

## 5. Transaction view drawer

`... → View transaction` opens a read-only drawer.

Show:
- Date
- Description/payee
- Tags
- Status
- Postings
- Accounts
- Amounts
- Quantities
- Prices
- Split information
- Useful created/updated metadata

Postings should be cards, not raw JSON/dense data.

## 6. Split transactions

Support multiple postings.

Requirements:
- No account-name clipping or overflow-hidden for split postings.
- Wrap/stack posting rows as required.
- Make posting direction visually clear.
- Use arrows/connectors where useful.
- Keep split rows readable on desktop and mobile.

Split editor supports:
- Multiple destination postings.
- Account per posting.
- Amount per posting.
- Quantity/price for instrument postings.
- Tags where appropriate.
- Validation that postings balance.
- Clear remaining/unallocated amount.

## 7. Merge transactions

Provide `Merge transactions` through the `...`/bulk actions.

Initial FinBodhi-style eligibility:
- Two or more transactions.
- Same date.
- Common compatible from or to account.

Validate eligibility before enabling the operation.

Merge must not silently lose postings, quantities, prices, tags or metadata. Conflicting values must be handled explicitly.

## 8. Bulk operations

Selection checkbox is required.

When rows are selected, show a bulk toolbar.

Initial actions:
- Merge
- Delete
- Add/modify tags where practical

Support select-all visible rows, clear selection and selected count.

Keep selection behaviour explicit across pagination.

## 9. Pagination

Transaction lists support:
- 20 rows
- 50 rows

Show current page, total/page information, previous/next and rows-per-page. Reuse the same pagination component.

## 10. Generic transaction filter

Filtering is a reusable component available anywhere transactions are shown:
- `/transactions`
- Account → Transactions
- Future transaction views

Logical modes:
- **Any**: at least one condition matches.
- **All**: every condition matches.

Condition model:

`Field → Operator → Value`

Initial fields/operators:

### Description
- contains
- does not contain
- equals
- starts with
- ends with

### Date
- equals
- before
- after
- between

### From Account / To Account
- is
- is not
- is in
- is not in

### Amount
- equals
- greater than
- less than
- greater than or equal
- less than or equal
- between

### Tags
- contains
- does not contain
- has any
- has all

### Transaction properties
- is split
- is not split

Filter UI should be compact. Open the full filter in a drawer/popover. Active conditions should remain visible outside the drawer.

## 11. Quantity and price

Investment-style postings need posting-level:
- `accountId`
- `amount`
- `quantity`
- `price`

Example:

```text
From: SBI Bank
Amount: ₹32,000

To: ABCL Corporate Bond Fund
Quantity: 269.6626183566
Price: ₹118.6668
```

Quantity and price are nullable for ordinary monetary postings.

They must live at posting level, not transaction level, because split transactions can contain multiple instruments with different quantities/prices.

Relevant account types include:
- Mutual funds
- Stocks
- Bonds/securities
- Commodities/metals where applicable

## 12. Instrument catalog

Do not maintain a manually curated permanent instrument catalog.

Instrument names should come from external providers for:
- Indian equities
- NSE/BSE instruments
- Mutual funds
- Commodities/metals
- Other supported instruments

When creating an investment account:
1. Select classification.
2. Select account/instrument type.
3. Search provider-backed instruments.
4. Sort results.
5. Select instrument.
6. Store provider identity locally.
7. Fetch/cache price history.

Search should support name, symbol/code and provider identifier.

Sort results with exact identifier/name matches first, then prefix/partial matches, then stable alphabetical/provider ordering.

Do not expose raw unsorted API responses.

## 13. Market-data abstraction

Keep external market data behind a provider boundary conceptually:

```text
InstrumentProvider
  searchInstruments()
  getInstrument()
  getHistoricalPrices()
  getLatestPrice()
```

Store provider identity so refreshes do not require fuzzy matching again.

## 14. Price history

FinBodhi's `_prices.json` demonstrates the required concept:

```json
{
  "currencyName": "INR",
  "instrumentId": "...",
  "instrumentType": "mf",
  "label": "...",
  "lastFetchedAt": "...",
  "timeSeries": [
    ["2026-08-13T18:30:00.000Z", "171.5836"],
    ["2026-08-12T18:30:00.000Z", "171.7931"]
  ]
}
```

Ledger does not need to copy this JSON format.

Preferred lifecycle:
1. Instrument selected during account creation.
2. Store provider instrument identity.
3. Fetch historical prices.
4. Persist locally.
5. Refresh latest/stale prices incrementally.
6. Use cached history for valuation/charts.

Do not fetch complete history on every render.

Show price freshness honestly, e.g. `as of yesterday`, `last refreshed ...`, or `price unavailable`.

## 15. Account page

Common structure across account classifications.

### Header
Show:
- Account icon
- Account name
- Current valuation/balance
- Relevant secondary values
- Latest price for instrument accounts
- Price freshness

Investment accounts also show:
- Current valuation
- Balance units
- Latest price

Actions:
- Add transaction
- Edit
- Archive where supported

### Tabs
1. Transactions
2. History
3. Settings

The same tabs remain across account types.

## 16. Account Transactions tab

Use shared transaction components:
- Add transaction
- Generic filter
- Pagination
- Desktop quick edit
- Modal edit
- View drawer
- Split/merge
- Quantity/price display

Account scope should be represented as an initial filter condition.

## 17. Account History

Two views:
- Balance
- Cashflow

### Balance
Show balance/valuation growth over selected period.

Hover should show exact date/value and relevant supporting values.

### Cashflow
Show inflows/outflows with:
- Monthly
- Yearly

Reusable date selection should support presets and custom ranges.

Useful presets:
- Current month
- Previous month
- Last 3 months
- Last 6 months
- Current year
- Previous year
- Last 3 years
- Custom

## 18. Account-type-specific metrics

### Asset / Investment
- Balance/current valuation
- Net investment
- Gain
- XIRR
- Units/latest price where applicable

### Liability
- Balance
- Drawn amount where applicable
- APR where applicable

### Income
- Balance

### Expense
- Balance

### Balancing
- Balance

Do not show irrelevant metrics.

## 19. Account settings

Settings content should be constrained on desktop rather than stretched across the viewport.

Show:
- Currency
- Tags
- Account-specific settings as needed

Tags are simple reusable strings, e.g.:

```text
["travel", "salary", "long-term"]
```

Not key-value pairs.

## 20. Account colours

Classification colours are semantic and consistent across the app:

| Classification | Colour |
|---|---|
| Income | Green |
| Expense | Red |
| Liability | Amber |
| Asset | Blue |
| Balancing | Purple |

Use semantic tokens. Do not hard-code page-specific colours.

The same account colour should appear consistently in account lists, selectors, transaction lists, headers and relevant charts.

## 21. Account icons

Add/Edit Account supports searchable Lucide icon selection:
- Search input.
- Icon grid/list.
- Selected state.
- Persist selected icon.

## 22. Account creation changes

Classification uses compact icon cards.

Rename:
- `Instrument Type` → `Account Type`

Remove:
- Label input.
- Opening balance input.

Opening balance is represented by an opening transaction because Ledger is double-entry.

Tags use simple multi-value tags.

Investment account creation resolves a provider-backed instrument and stores its identity.

## 23. Navigation/routes

Keep routes clear and minimal, for example:

```text
/app
/accounts
/accounts/:accountId
/transactions
```

Edit actions should generally be UI state (modal/drawer/inline), not separate navigation routes.

Do not add duplicate secondary navigation for Accounts or Transactions when the sidebar already provides primary navigation.

## 24. Menus/controls

Every menu item uses icon + text.

Icon-only is acceptable for:
- Sidebar collapse control.
- Desktop transaction quick-edit.

The sidebar collapse CTA should be icon-only.

## 25. Design system

Use:
- Shadcn UI components.
- Semantic tokens.
- Flexoki-inspired theme.
- Geist Sans.
- Geist Mono for numbers.
- Light / Dark / System modes.

Verify all dropdowns, popovers, dialogs, sheets, selects and menus use established Shadcn components and remain readable in both themes.

Pay particular attention to contrast, selected/hover/focus/disabled states and mobile touch targets.

## 26. Architecture delta

### Transaction/posting
Support posting-level:
- account
- amount
- quantity
- price

Support multi-posting/split transactions.

### Tags
Replace key-value tag modelling with simple reusable tags.

### Instrument data
Introduce provider abstraction for:
- search
- instrument identity
- historical prices
- latest prices

### Price cache
Persist fetched market data locally. Refresh incrementally.

### Opening balance
Do not require an independent opening-balance account field. Use transactions/postings.

### Shared components

Prefer reusable implementations such as:

```text
TransactionTable
TransactionRow
TransactionQuickEdit
TransactionEditDialog
TransactionViewDrawer
TransactionFilter
TransactionBulkToolbar
TransactionPagination
PostingEditor
SplitTransactionEditor
InstrumentSelector
PriceHistory
AccountMetrics
AccountHistoryCharts
TagEditor
IconSelector
```

## 27. Database/model delta

### Account
Support:
- classification
- account type
- currency
- icon
- tags
- provider/instrument identity where applicable

### Transaction
Remains the business event containing one or more postings.

### Posting
Conceptually:

```text
accountId
amount
quantity?
price?
```

Quantity/price are nullable.

### Tags
Preferred conceptual model:

```text
Tag
  id
  name

AccountTag
  accountId
  tagId

TransactionTag
  transactionId
  tagId
```

Adapt to the existing schema where possible, but preserve the requirement that tags are plain reusable strings.

### Instrument
Conceptually:

```text
Instrument
  id
  provider
  providerInstrumentId
  type
  symbol
  name
  currency
  metadata
```

### Price history
Conceptually:

```text
InstrumentPrice
  instrumentId
  timestamp
  price
  currency
  fetchedAt
```

Exact physical schema can follow the existing database architecture.

## 28. Onboarding/demo compatibility

Existing onboarding rules remain unless superseded elsewhere.

Demo data is available **only at family creation**.

Demo family should include:
- 1 family
- At least 2 members
- Salary + freelance income accounts
- 2 bank assets
- 2 stock accounts
- 1 metal
- 2 mutual funds
- 1 home loan
- 1 credit card
- Expenses as needed
- 1 balancing account
- Approximately 1,000 transactions covering at least one year and touching all accounts

Family creation offers:
- Empty family
- Family with demo content

Demo content is copied into the family-specific database.

Cleanup may delete all content except family and members. Members are deleted manually.

## 29. Acceptance criteria

This delta is complete when:

- Desktop transactions support explicit quick-edit inline editing.
- Mobile uses modal/sheet editing.
- `...` supports view/edit/split/merge/delete as applicable.
- View opens a read-only drawer.
- Split postings never clip account names.
- Bulk selection and actions work.
- Pagination supports 20/50 rows.
- Generic transaction filter works globally and within accounts.
- Filter supports Any/All and the initial condition set.
- Investment postings support quantity + price.
- Account history has Balance and Cashflow.
- Account metrics adapt by classification.
- Investment accounts can show valuation, units, latest price, net investment, gain and XIRR where data permits.
- Liability accounts can show balance/drawn amount/APR where applicable.
- Account settings are constrained on desktop.
- Tags are simple reusable tags.
- Account colours are classification-based and consistent.
- Account icon selection uses searchable Lucide icons.
- Instrument selection is provider-backed and sorted.
- Historical prices are cached/persisted and incrementally refreshed.
- Opening balance is represented through transactions.
- Routes are minimal.
- Duplicate secondary navigation is removed.
- Light/Dark/System themes are readable.
- Geist Sans and Geist Mono render correctly.
- Shadcn controls are used consistently.

## 30. Explicit non-goals

Do not expand this delta into:
- Full reporting/analytics suite.
- Complete settings implementation.
- Recurring transaction redesign.
- Import/export redesign.
- Portfolio analytics beyond account-history requirements.
- Real-time trading.
- Manually maintained global instrument catalog.

Those should be separate future deltas.

---

## Implementation principle

**Prefer one reusable model/component over multiple screen-specific implementations.**

Filtering, editing, posting editing, tagging, account metrics, instrument selection and price history should be shared capabilities composed by screens rather than duplicated.


## Architecture Delta — Reusable Transaction Components

### Transaction List Reuse

The **main Transactions page** and the **Transactions tab/view inside an Account page** must use the **same reusable transaction-list component and transaction interaction components**.

Do not implement a separate transaction table/list for Account pages.

The shared transaction components should support:

- transaction display
- account/posting display
- quantity and price display
- split transaction rendering
- row actions
- quick edit / inline editing on desktop
- modal editing
- view transaction drawer
- split / merge actions
- bulk selection and bulk operations
- pagination
- rows-per-page selection
- generic transaction filtering

### Scope / Filtering

The main Transactions page displays transactions across the current family/database according to the active filters.

When the same component is rendered from an Account page, it receives an **account scope/filter** and displays only transactions related to that account.

Account-scoped transactions must therefore be a **filtered instance of the shared transaction component**, not a different data model or UI implementation.

Conceptually:

```text
Transactions Page
  └── TransactionList
      ├── scope: family
      └── filters: user-selected

Account Page → Transactions tab
  └── TransactionList
      ├── scope: account:{accountId}
      └── filters: account scope + user-selected
```

The component architecture should allow additional scopes later without duplicating the transaction UI, such as date ranges, tags, member/profile, or other account/posting relationships.

### Account Page Contract

The Account → Transactions tab should behave like the main Transactions page with the account context already applied:

- same columns and responsive behaviour where appropriate
- same edit behaviour
- same split/merge behaviour
- same transaction filter component
- same pagination
- same bulk operations
- same transaction detail drawer
- same row action menu

The account page may provide account-specific defaults or contextual actions, but must not fork the transaction implementation.
