# Open Decisions

This file contains only decisions intentionally deferred or requiring future design.

## Opening balance UX

Accounting principle is fixed.

UX can later determine whether opening balances are:
- guided setup
- account action
- dedicated transaction type

## Tag UI evolution

Storage is fixed as inline `string[]` (simple opaque tags — product-polish
pass, superseding the earlier `Record<string,string>` shape).

Resolved: TagInput suggests previously-used tags via a lightweight
distinct-values read (`listDistinctTags`), no new persistence.

No global Tag entity is planned.

## Investment model

Future design required for:
- STOCK
- METAL
- MUTUAL_FUND
- ETF
- quantity
- unit price
- valuation
- cost basis
- tax rules
- price feeds

## Multi-currency / FX

Future design required for:
- additional currencies
- FX rates
- conversion
- FX gain/loss
- cross-currency transactions

## Spaces

Future design required for:
- PERSONAL / SHARED spaces
- member participation
- archived spaces

## Expense sharing

Future design required for:
- expense allocation between Members
- receivables/payables
- settlements
- shared-space visibility

Accounting splits and expense sharing must remain separate concepts.

## Imports

Future design required for:
- email
- SMS
- PDF statements
- CSV/XLS
- raw source records
- parser pipeline
- duplicate detection
- review workflow

## Transaction history

Future design required for:
- immutable versions
- edit history
- deletion history
- diff presentation
- retention

MVP uses hard delete and has no history UI.

## Authentication / sharing

Future design required if the local application becomes multi-user over a network.

MVP Members are local financial profiles only.

## AI / learning

Future design required for:
- categorisation
- parser assistance
- learning from corrections
- LLM provider/local model
