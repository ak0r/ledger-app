# Delta: Instrument Catalogue

## Status

**Decision: Locked for implementation. Shipped 2026-09-04** — see the
implementation note at the end of this file, ADR-039 in
`docs/07-decisions.md`, and `docs/04-modules.md`. Supersedes the catalogue
portions (§5, §9-§11) of `docs/completed/2026-08-21-Instrument-Model-
Pricing-Foundations.md`, whose own status note points here.

---

## Purpose

Add the **Instrument Catalogue** as the source for selecting investment
instruments when creating an instrument-backed account.

This is **catalogue only**.

Do not implement:
- market pricing
- NAV/price refresh
- valuation
- portfolio valuation
- unrealised gain/loss
- external pricing providers
- FX valuation

The catalogue must work independently of live market-data/valuation
features.

---

## 1. Catalogue sources

Use IndianAPI static catalogue files.

### Stocks

Primary:
`https://analyst.indianapi.in/static/all_stocks.json`

Fallback:
`https://pro.indianapi.in/static/all_stocks.json`

### Mutual Funds

Primary:
`https://analyst.indianapi.in/static/all_mf.json`

Fallback:
`https://pro.indianapi.in/static/all_mf.json`

Source order:

```text
Analyst
   ↓ failure / unusable response
Pro
```

If both sources fail, do not destroy or replace an existing local
catalogue.

These URLs are **ingestion sources**, not runtime dependencies for
transaction/account functionality.

---

## 2. Source observation

The stock catalogue currently contains records shaped like:

```json
{
  "bse-code": "541400",
  "name": "ZIM Laboratories",
  "id": "S0000719",
  "nse-code": "ZIMLAB"
}
```

The stock source can contain empty or `"null"`-like NSE values. Normalize
those to database `NULL`, not the literal string `"null"`.

Inspect the actual MF feed before finalizing its mapping. Do not assume
stock fields apply to mutual funds.

---

## 3. Normalized Ledger catalogue schema

Use one `instruments` table for all instrument types.

### `instruments`

```text
id                    UUID / existing Ledger ID
type                  enum: STOCK | MUTUAL_FUND
name                  string
source                enum/string: INDIANAPI
source_id             string nullable
nse_code              string nullable
bse_code              string nullable
isin                  string nullable
created_at            timestamp
updated_at            timestamp
```

Rules:

- `id` is Ledger's internal stable identifier.
- `source_id` stores the external catalogue identifier where available.
- `name` is the display name.
- `type` identifies the instrument category.
- `nse_code`, `bse_code`, and `isin` are nullable.
- Do not force an identifier into a field when the source does not
  provide it.
- Do not use `name` as the primary identity.
- Do not use IndianAPI `id` as Ledger's primary key.

### Identity

Prefer source identity over name matching.

For IndianAPI:

```text
(source, source_id)
```

should be unique when `source_id` exists.

Also retain available:
- NSE code
- BSE code
- ISIN

Do not assume all identifiers are present.

---

## 4. Catalogue ingestion

Implement a catalogue ingestion service/use-case.

Conceptually:

```text
refreshInstrumentCatalogue(type)
        │
        ├── fetch Analyst
        │
        ├── validate response
        │
        ├── if unusable → fetch Pro
        │
        ├── normalize source records
        │
        ├── upsert instruments
        │
        └── preserve existing local records not present in the new response
```

Do not:
- delete the entire catalogue before importing
- make application startup depend on the remote catalogue
- make account creation depend on IndianAPI availability
- make transactions depend on IndianAPI availability
- overwrite identity because a display name changed
- treat a failed fetch as an empty catalogue

A failed/empty/unusable response must not wipe existing instruments.

---

## 5. Search / selection

Search the **local Ledger catalogue**, not IndianAPI on every keystroke.

For stocks, search should match:
- name
- NSE code
- BSE code
- source ID

For mutual funds, search should match:
- name
- normalized identifiers available from the MF source

Keep search generic enough to support additional identifiers later.

---

## 6. Account relationship

Keep:

```text
Account → Instrument
```

An Account references one Instrument.

Do not put catalogue/source fields directly on Account.

Do not put `instrumentType` into the minimal domain `AccountRef`.

Instrument-specific transaction rules remain application/use-case
concerns.

---

## 7. User-created instruments

The catalogue is a discovery convenience, not a hard whitelist.

Allow creating an instrument when it cannot be found in the imported
catalogue.

Minimum:

```text
type
name
```

Source-specific fields remain nullable.

Do not require an IndianAPI identifier for a valid Ledger instrument.

---

## 8. Separation from pricing

This catalogue does NOT establish a price.

Do not add:

```text
current_price
nav
market_price
reference_price
last_price
valuation
```

Transaction-time `quantity` and `unitPrice` are transaction-posting data,
not catalogue pricing.

---

## 9. Refresh / seed behaviour

Support independent catalogue refresh for:

```text
Stocks
Mutual Funds
```

A development/admin operation is sufficient initially if there is no
existing user-facing catalogue-management screen.

Do not build a catalogue-management UI unless already required.

---

## 10. Acceptance criteria

- [x] One normalized `instruments` catalogue supports STOCK and
      MUTUAL_FUND.
- [x] Analyst is primary.
- [x] Pro is fallback.
- [x] Stock and mutual-fund feeds are supported.
- [x] Source identifiers are retained.
- [x] NSE/BSE/ISIN are nullable.
- [x] Empty / `"null"` exchange identifiers become NULL.
- [x] Ledger ID is independent of external source ID.
- [x] Existing local instruments survive failed refreshes.
- [x] Local search does not depend on live IndianAPI.
- [x] User-created instruments remain possible.
- [x] Account → Instrument relationship remains intact.
- [x] No pricing/valuation functionality is introduced.
- [x] Add schema migration.
- [x] Add normalization tests.
- [x] Add primary/fallback ingestion tests.
- [x] Add duplicate/upsert tests.
- [x] Add failed/empty response tests proving existing catalogue
      preservation.
- [x] Add search tests for name and identifiers.

---

## Implementation notes (2026-09-04)

- **§3 Identity/uniqueness**: `(source, source_id)` is enforced at the
  use-case/repository layer (`upsertCatalogueInstruments`,
  `src/server/repositories/instruments.ts`), not a DB unique index —
  matches this codebase's existing posture toward relationships SQLite
  can only constrain via a full table-recreate (see ADR-038 and
  `accounts.instrumentId`'s own schema comment). A user-created Instrument
  has `source = NULL`, so it can never collide with a catalogue identity
  lookup.
- **§4 "preserve existing on failure"** falls out of the upsert design
  rather than being separate logic: `upsertCatalogueInstruments` is
  strictly additive/updating and is simply never called when every source
  is unusable — there's no prune/delete step that could get this wrong.
- **§2 MF feed shape** was inspected against the real endpoint before
  writing the mapping, per the delta's own instruction. It is **not**
  flat like the stock feed: `{ categoryName: { subCategoryName: [fund,
  ...] } }`, e.g. `{"Debt": {"Floating Rate": [{...}]}}`. Only `id`/
  `mfName` are kept; NAV/returns/rating fields present in the real
  response are pricing data (§8 non-goal) and are dropped, never carried
  into the catalogue. The feed carries no NSE/BSE/ISIN for funds — all
  three stay null on every MUTUAL_FUND catalogue row.
- **§5 Search** required rewriting the Account form's Instrument picker
  (`src/components/instrument-picker.tsx`), previously a fetch-the-whole-
  type-then-client-filter combobox from the Revised Investment Model
  delta (ADR-038) — fine when the catalogue only held user-created rows,
  wrong once STOCK can hold ~5600 ingested rows. Rewritten to a 250ms-
  debounced per-keystroke server search (`searchInstrumentsAction` →
  `searchInstruments`, SQL `LIKE` over name/nseCode/bseCode/sourceId,
  capped at 25 results). An empty query shows a "Type to search…" hint
  instead of fetching anything.
- **§9 admin operation**: `refreshInstrumentCatalogueAction` exists
  (thin action → `refreshInstrumentCatalogue` use-case) but nothing in
  the UI calls it yet — no catalogue-management screen was built, per
  the delta's own "do not build one unless already required."
- Not done, out of this delta's scope by its own §1/non-goals: pricing,
  NAV, valuation, external pricing providers, and catalogue refresh-
  staleness metadata (`last_refreshed`, §11 of the superseded 2026-08-21
  doc — not requested here, deferred to whenever pricing is built).
