# Delta --- Instrument Model & Reference Pricing Foundations

**Date:** 2026-08-21\
**Status:** Ready for implementation

> **Status note (2026-08-26):** Step 1 (Instrument entity, catalogue-only)
> shipped 2026-08-22. Steps 2-10 (pricing, quantity, valuation, identifiers)
> not started.

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
