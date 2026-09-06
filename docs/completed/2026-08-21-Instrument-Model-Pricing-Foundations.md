# Delta --- Instrument Model & Reference Pricing Foundations

**Date:** 2026-08-21\
**Status:** Closed (2026-09-06) — superseded by the Portfolio module. See
final status note below.

> **Status note (2026-08-26):** Step 1 (Instrument entity, catalogue-only)
> shipped 2026-08-22. Steps 2-10 (pricing, quantity, valuation, identifiers)
> not started.

> **Status note (2026-09-03):** "Revised Investment Model" delta shipped
> quantity + Account→Instrument wiring, under a design that supersedes §4
> below — see ADR-038 in `docs/07-decisions.md`. Quantity/price live on the
> **posting** (`postings.quantity`/`postings.price`), not the Account, and
> every posting carries them (not just Instrument-backed ones); the
> Transaction balance check generalises to reconciliation value
> (`quantity × price` in the credit side's currency) rather than a raw
> debit/credit minor-units sum. Also shipped: the Account form's Instrument
> picker (search-or-create combobox over the catalogue, §10, still
> user-authored only — no external catalogue source) and the transaction
> form's Units field for Instrument-backed destinations (§17 step 6, folded
> into this delta rather than done separately).
>
> Still not started: instrument identifiers (§5, step 2), an external/
> refreshable catalogue source (§10-11, step 5), the pricing provider
> abstraction (§6-7, step 7), reference price storage/provenance (§8, step
> 8), any actual free pricing provider (§9, step 9), and derived account
> valuation (§14, step 10). The Currency Conversion leg's rate is still
> auto-derived from the two legs' own amounts, not a user-entered field.

> **Status note (2026-09-04):** The "Instrument Catalogue" delta
> (`docs/completed/2026-09-04-Instrument-Catalogue.md`, ADR-039 in
> `docs/07-decisions.md`) **supersedes this doc's catalogue-related
> sections (§5, §9-§11)** and closes steps 2, 5, and 6 of §17's sequence:
> real IndianAPI stock/mutual-fund catalogue ingestion (Analyst primary,
> Pro fallback, upsert-preserving-on-failure), NSE/BSE/ISIN identifiers
> (as flat columns on `instruments`, not the child `InstrumentIdentifier`
> entity §5 originally sketched — ADR-039), and a real server-side search
> replacing the Account form picker's old fetch-everything approach.
> COMMODITY still has no catalogue source (delta's own non-goal).
>
> Still not started: the pricing provider abstraction (§6-7, step 7),
> reference price storage/provenance (§8, step 8), any actual free
> pricing provider (§9, step 9), derived account valuation (§14, step
> 10), and catalogue refresh-staleness metadata (`last_refreshed`, §11 —
> refresh is available but nothing tracks when it last ran or triggers it
> automatically). The Currency Conversion leg's rate is still auto-derived
> from the two legs' own amounts, not a user-entered field.

> **Status note (2026-09-05) — this entire doc's Account↔Instrument model
> is now superseded.** The Ledger/Portfolio delink (ADR-040 in
> `docs/07-decisions.md`, `analysis/folioman-vs-ledger/
> 06-pwa-validation-and-domain-delink.md`) reverses the 2026-09-03 status
> note above: a Ledger Account can never be Instrument-backed again
> (`MUTUAL_FUND`/`STOCK`/`COMMODITY` removed from `INSTRUMENT_TYPES`), the
> Account form's Instrument picker and the transaction form's Units field
> are deleted, and `postings.quantity`/`price` now exist solely for
> Currency Conversion's persisted rate. §§2-4 (Instrument as an
> Account-linked entity), the quantity/valuation model in §4/§14, and the
> Account→Instrument relationship in §3 no longer describe where this
> codebase is going — Portfolio gets its own separate
> `PortfolioAccount`/`InvestmentTransaction`/`Holding` model instead
> (`analysis/folioman-vs-ledger/07-folioman-database-model.md`), tracked
> outside this doc from here on. The Instrument Catalogue itself (§§5,
> 9-11, superseded by the 2026-09-04 note above) is unaffected by this
> delink and remains exactly as shipped — it's reused by the future
> Portfolio module rather than by Ledger Accounts.

> **Closing status note (2026-09-06):** the pricing/valuation steps this
> doc originally scoped (§6-9, steps 7-9) are now done, inside the
> Portfolio module the 2026-09-05 note above pointed to instead of here —
> see ADR-041 through ADR-046 in `docs/07-decisions.md` and the
> Investments section of `docs/04-modules.md`: CAS PDF and demat eCAS
> statement import, Stock tradebook import, an AMFI bulk NAV feed plus an
> NSE/Yahoo equity price feed with fallback, XIRR, and a Holding-integrity
> signal. This doc is now fully closed — every step is either shipped
> (elsewhere) or a deliberate, separately-tracked deferral (capital-gains
> tax, corporate-action replay, full reconciliation). Nothing further reads
> this doc as a live spec.

## 1. Context

Ledger is a personal finance ledger based on double-entry accounting.

It is **not** intended to be a brokerage, trading platform, or
authoritative portfolio valuation system.

Market/reference prices are informational and are used primarily to
calculate approximate current valuations in one place. The user's bank,
broker, mutual-fund platform, or other financial institution remains the
source of truth.

Do not attempt to model the full complexity of securities trading at
this stage.

## 2. Core design

Separate:

``` text
Account
    ↓
Instrument
    ↓
Reference Price
```

### Account

The Account owns:

-   classification
-   account type
-   currency
-   balance
-   transactions
-   quantity where applicable

**Currency belongs to the Account.**

There is no price currency on Instrument or Reference Price.

### Instrument

An Instrument identifies the asset represented by an investment/asset
account.

Initial instrument types:

``` text
MUTUAL_FUND
STOCK
COMMODITY
```

Do not create Instruments for cash, bank, credit card, loan, income, or
expense accounts.

### Reference Price

A reference price is an external market/reference observation for an
Instrument.

``` text
Approximate valuation = Quantity × Reference Price
```

The price is not treated as authoritative accounting data.

## 3. Account → Instrument

An Account may optionally reference an Instrument:

``` text
Account
    ├── classification
    ├── type
    ├── currency
    └── instrument_id ──→ Instrument
```

Examples:

``` text
HDFC Bank Shares
    classification: ASSET
    type: STOCK
    currency: INR
    instrument: HDFC Bank
```

``` text
Parag Parikh Flexi Cap
    classification: ASSET
    type: MUTUAL_FUND
    currency: INR
    instrument: Parag Parikh Flexi Cap
```

A normal cash/bank account does not need an Instrument.

## 4. Quantity

Instrument-backed accounts need quantity support.

Amount and quantity are different dimensions:

``` text
amount   → currency-bound through Account
quantity → units of the associated Instrument
```

Example:

``` text
HDFC Bank
quantity: 10
reference price: ₹1,950 / unit
approximate valuation: ₹19,500
```

For mutual funds:

``` text
quantity: 72.45 units
NAV: ₹138.02 / unit
```

For commodities, the model must allow a pricing unit because providers
may quote quantities such as 10 grams, 1 kg, barrel, etc.

Do not put commodity unit logic into the Account model.

## 5. Instrument identifiers

An Instrument should support provider-specific identifiers.

Conceptually:

``` text
Instrument
    └── InstrumentIdentifier
            provider
            code
```

Example:

``` text
HDFC Bank

Yahoo:
    HDFCBANK.NS

NSE:
    HDFCBANK

BSE:
    500180
```

Do not assume one universal external code.

## 6. Pricing architecture

Pricing must be modular.

The Account UI should **not ask the user to select a pricing provider**.

The user sees:

``` text
Price data
Automatically managed
```

Internally:

``` text
Instrument
    ↓
Pricing Service
    ↓
Provider Resolver
    ↓
Pricing Provider
    ↓
Reference Price
```

Possible provider implementations include Yahoo, MFAPI, AMFI,
mf.captnemo, IndianAPI, and future providers.

The rest of Ledger must not depend directly on a specific provider.

## 7. Pricing provider abstraction

Conceptually, providers expose:

``` text
getLatestPrice(instrument)
getHistoricalPrices(instrument, range)
```

Providers can be added, removed, replaced, or reordered without changing
Account, Instrument, Transaction, or valuation fundamentals.

## 8. Provider provenance

Although users do not select providers, reference prices retain
provenance:

``` text
ReferencePrice
    instrument_id
    observed_at
    price
    provider
```

This supports debugging, stale/bad-data investigation, provider changes,
and future auditing.

Provider information is internal metadata, not account configuration.

## 9. Provider resolution

Provider selection is an application concern.

Conceptually:

``` text
Instrument type
    ↓
available providers
    ↓
availability/configuration
    ↓
selected implementation
```

Free providers should be preferred where appropriate.

API-key providers may become available when an AppUser has configured a
key.

API keys are **AppUser-scoped**, not
Profile/Account/Instrument-scoped.

Do not expose provider selection during Account creation/editing.

## 10. Catalogue vs pricing

Keep **instrument discovery** separate from **pricing**.

Catalogue answers:

> What instruments are available to select?

Pricing answers:

> What is the current/reference value of this selected Instrument?

The Account search should query a local catalogue rather than calling
external providers live while the user types.

Potential free catalogue sources currently identified:

### Mutual Funds

-   AMFI
-   MFAPI
-   mf.captnemo

### Stocks

-   public/static stock catalogue sources such as IndianAPI's catalogue
-   future catalogue providers

### Commodities

To be addressed separately.

## 11. Catalogue refresh

Maintain catalogue refresh metadata:

``` text
Catalogue
    last_refreshed
```

Refresh when older than approximately 24 hours.

``` text
Catalogue exists
    ↓
last_refreshed < 24h?
    ├── Yes → use existing catalogue
    └── No  → refresh in background
```

A failed refresh must not prevent existing accounts from being viewed or
edited.

## 12. Pricing cache

Pricing is cached independently from the catalogue.

``` text
ReferencePrice
    observed_at
    price
    provider
```

Refresh reference pricing approximately every 24 hours.

There is **no seeded pricing requirement**.

If no pricing provider is available, the Instrument simply has no
current reference price. The account and transactions remain fully
usable.

## 13. API keys

API keys belong to the AppUser:

``` text
AppUser
    └── Provider credentials
```

They are not stored against Profile, Account, or Instrument.

API-key providers are a later implementation stage. Free providers come
first.

## 14. Valuation

Valuation is derived information:

``` text
Account quantity
        ×
latest reference price
        ↓
approximate current valuation
```

Do not make valuation part of the accounting transaction amount.

Reference-price changes must never modify historical transactions.

## 15. Non-goals

Do not implement now:

-   broker-grade portfolio reconciliation
-   intraday trading
-   order/execution modelling
-   tax lots
-   FIFO/LIFO
-   corporate-action processing
-   dividend processing
-   brokerage/settlement modelling
-   exchange order books
-   authoritative NAV/market valuation
-   multi-provider comparison UI
-   user-selected pricing provider
-   seeded price history
-   automatic correction of historical transactions from price changes

## 16. Design boundary

``` text
Ledger accounting
    = source of truth for recorded transactions

Instrument catalogue
    = discovery/reference data

Reference pricing
    = external informational data

Valuation
    = derived approximation
```

External prices must never rewrite accounting records.

## 17. Implementation sequence

``` text
1. Instrument entity
        ↓
2. Instrument identifiers
        ↓
3. Account → Instrument relationship
        ↓
4. Quantity support
        ↓
5. Instrument catalogue abstraction/cache
        ↓
6. Instrument search during Account create/edit
        ↓
7. Pricing provider abstraction
        ↓
8. Reference price storage
        ↓
9. First free pricing providers
        ↓
10. Approximate account valuation
```

Provider-specific integrations stay behind the abstraction.

## 18. Acceptance criteria

-   Instrument is independent from Account.
-   Account can reference an Instrument.
-   Instrument supports Mutual Fund, Stock, and Commodity.
-   Account currency remains the sole currency context.
-   Quantity is separate from monetary amount.
-   Instrument identifiers can support provider-specific codes.
-   Pricing is separate from Instrument.
-   Pricing provider implementation is abstracted.
-   Reference-price provenance is retained.
-   Provider selection is not exposed to users.
-   Catalogue discovery and pricing are separate concerns.
-   Catalogue refresh metadata is maintained.
-   Reference prices are cached with observation time.
-   Missing pricing data does not prevent normal ledger operation.
-   Historical transactions are never rewritten by reference-price
    changes.
-   New providers can be added without changing Account/Transaction
    fundamentals.

## 19. Locked decisions

-   Instrument is separate from Account.
-   Account owns currency.
-   Quantity is separate from monetary amount.
-   No price currency.
-   Instrument-backed accounts can have quantities.
-   Pricing is reference/informational, not authoritative.
-   Pricing providers are abstracted.
-   Users do not select pricing providers.
-   Provider provenance is retained internally.
-   Catalogue and pricing are separate systems.
-   Catalogue is locally searchable and refreshable.
-   Pricing is cached independently.
-   No seeded pricing.
-   API keys, when supported, are AppUser-scoped.
-   Free providers first; API providers later.
-   Ledger does not attempt broker-grade trading/accounting precision.

## 20. Deferred

-   Detailed commodity/metals taxonomy.
-   Complete provider list and priority/fallback rules.
-   API-key provider integrations.
-   Corporate actions.
-   Tax-lot accounting.
-   Broker reconciliation.
-   Advanced portfolio analytics.
