# Technical Architecture

## Stack

- Next.js
- React
- TypeScript
- App Router
- shadcn/ui
- Tailwind CSS
- TanStack Table
- React Hook Form
- Zod
- SQLite
- Drizzle ORM
- Node.js
- Python 3 + `casparser` (2026-09-05, Portfolio Adoption Plan — CAS PDF
  import only, invoked as a local subprocess from `scripts/cas_parser.py`;
  never a network call, per Import Privacy, rule #23). The only non-Node
  runtime dependency in this stack; must be present wherever the app runs
  (self-hosted Docker image or local dev machine) for CAS import to work —
  every other feature is unaffected if it's absent.

Initial deployment: local machine.

Later:

- Docker Compose
- Tailscale
- Traefik if required

Self-hosted, single-instance. No cloud dependency.

## Architecture

```text
Browser
   ↓
Next.js (app/, actions)
   ↓
Application / services (server/)
   ↓
Domain core (core/ledger, core/portfolio)
   ↓
Drizzle
   ↓
SQLite
```

Two sibling domains live under `core/`: `core/ledger` (Profile/Currency/
Account/Transaction/Posting — the accounting spine) and `core/portfolio`
(PortfolioAccount/Folio/InvestmentTransaction/Holding/NAVHistory — the
investment-tracking domain, ADR-040/041). They are deliberately delinked:
a Ledger Account can never be Instrument-backed, Portfolio never writes to
`accounts`/`transactions`/`postings`, and an ESLint rule
(`eslint.config.mjs`) enforces `core/portfolio` can't import `core/ledger`
at build time — the two domains share only the underlying Instrument
Catalogue (`core/portfolio/instruments`, not Profile-scoped, reused as
shared reference data).

## Domain boundary

Core domain code (`core/ledger`, `core/portfolio`) must not depend on:

- React/UI
- import parsers
- email/SMS APIs
- AI providers
- Spaces
- expense-sharing logic

## API

No separate REST API — Next.js Server Actions are the only server
boundary.

## Validation

Zod for input validation.

Double-entry validation server-side/domain-side.

## Storage

SQLite is source of truth.

External documents later should live outside transaction rows.

## Testing

Critical tests:

- balanced transaction accepted
- unbalanced rejected
- expense
- income
- transfer
- credit-card purchase
- credit-card payment
- multi-posting transaction
- opening balance
- edit preserves balance
- delete does not corrupt balance

## Money representation

Monetary values are stored as integer minor units.

No floating-point money representation.

Currency owns the scale:

```text
Currency
├── code
├── symbol
└── minor_unit_scale
```

Account references Currency.

Posting references Account, so Posting currency is derived from Account.

Multiple currencies exist per Profile (Currency Catalogue,
`docs/04-modules.md`) — any Posting may independently be priced in a
currency other than the Profile's Base Currency (ADR-047); genuine N-leg
cross-currency Transactions are supported, not just one fixed 2-posting
Conversion shape. `MIXED_CURRENCY_UNSUPPORTED` is retired.

## Transaction persistence invariant

A persisted Transaction is always complete and balanced.

Transient draft form state exists only in the client/application layer.

No persisted `DRAFT` status.

## Transaction ownership invariant

`transactions.profile_id` is explicit.

Every Posting Account must belong to the same Profile.

The domain/application layer must validate this before persistence.

## Deletion

Transactions are hard-deleted.

Delete the transaction aggregate atomically, including Postings and dependent transaction-level records.

## Naming conventions

Database:

```text
snake_case
```

Examples:

```text
profile_id
transaction_id
account_type
created_at
```

TypeScript:

```text
camelCase
```

Examples:

```text
profileId
transactionId
accountType
createdAt
```

React components and TypeScript types:

```text
PascalCase
```

Enums/constants:

```text
UPPER_SNAKE_CASE
```

Keep database naming and application naming separate. ORM mappings can translate between them.

## Profile context

Renamed from the original "Member" concept (2026-08-20 User Simplification
delta) — real authentication now exists (AppUser login/session). Profile is
**application-level context**, not a URL segment (2026-08-26 routing
flattening delta): routes are flat and top-level (`/accounts`,
`/transactions`, `/imports`, `/recurring`, `/settings/...`), and the active Profile is
resolved server-side by `requireActiveProfile()` (`src/server/authz.ts`)
from an `activeProfileId` cookie, falling back to the AppUser's own Profile.
It is `cache()`-wrapped so a layout and its page calling it in the same
request cost one DB lookup, not two.

A Primary User can switch their active Profile via `activateProfileAction`
(any Profile in the Hosted Instance, reachable from the `/settings/profiles`
roster); a Normal AppUser has exactly one and the cookie is irrelevant for
them. Switching is a single global cookie, not per-tab: changing the active
Profile in one browser tab changes it everywhere in that browser, by design.

`requireProfileAccess(profileId)` still exists for the handful of actions
that address a specific *other* Profile by id rather than "the" active one
— switching to it (`activateProfileAction`), or a Primary User editing/
cleaning up an arbitrary Profile from `/settings/profiles/[id]/edit`.

All Profile-scoped operations require one of these checks. The domain layer
must still validate ownership independently of it (rule #17).

## Tag storage

Tags are stored inline as JSON on Account and Transaction records.

Application type:

```ts
type Tags = string[];
```

A flat list of opaque, user-defined strings — not key/value, not typed, not
hierarchical (product-polish pass, superseding the earlier
`Record<string,string>` shape).

No normalized Tag entity or join tables.

This is intentional: tags are per-record metadata/views, not shared entities.

## Transaction UI modes

Simple mode handles common two-leg transactions.

Split mode handles N-leg transactions.

The domain model remains generic; UI complexity is progressive disclosure.

## Domain invariants

Enforce in domain/application code and test them:

```text
postings >= 2
posting.units != 0; posting.price_num > 0; posting.price_denom > 0
posting.base_amount == round_half_even(units * price_num / price_denom)
sum(base_amount) == 0
posting.account.profile_id == transaction.profile_id
a posting may independently price into the profile's Base Currency (N-leg FX, ADR-047)
```
