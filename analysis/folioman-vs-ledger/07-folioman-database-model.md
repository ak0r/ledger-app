# Folioman Database Model — Reference Extract

Extracted directly from the Django ORM model source (`app/src/folioman_app/models/{base,master,ledger,jobs,integrity,licensing}.py`) in the cloned reference repo (`/tmp/folioman-analysis`, not vendored into Ledger). This is a reference for Ledger's own future `core/portfolio` table design — not a spec to copy verbatim; Ledger has no `Family`/multi-advisor concept and no licensing tier, and its own decisions (file 06) already diverge from Folioman's no-ledger model (Ledger keeps double-entry for its own domain; only Portfolio adopts this shape).

All models inherit `TimeStampedModel` (abstract): `created_at` (auto-set on create), `updated_at` (auto-set on every save). Omitted from each table below to avoid repetition.

Auth: Folioman uses **Django's built-in `auth.User`** unmodified (`settings.AUTH_USER_MODEL` is not overridden) — no custom user table.

---

## Master / reference data (not investor-scoped — global facts shared by every investor)

### `AMC` — Asset Management Company (mutual fund house)
| Field | Type | Notes |
|---|---|---|
| `name` | CharField(255) | unique |
| `code` | CharField(32) | blank-default |

### `Security` — canonical security reference (mirrors `folioman_core.models.Security`)
| Field | Type | Notes |
|---|---|---|
| `security_type` | CharField(20), choices | from core `SecurityType` enum |
| `name` | CharField(255) | |
| `isin` | CharField(12) | indexed, blank-default |
| `symbol` | CharField(32) | blank-default |
| `exchange` | CharField(16) | blank-default |
| `currency` | CharField(3) | default `"INR"` |
| `amfi_code` | CharField(16) | indexed, blank-default |
| `amc` | FK → `AMC`, null, `on_delete=PROTECT` | |
| `metadata` | JSONField | equity_oriented (112A eligibility), fund_type, coin_id, principal, etc. |
| `nav_feed_closed` | BooleanField, default False | set when the feed has no data and none is held — a matured/delisted scheme, distinguished from a transient gap |
| `corporate_actions_synced_at` | DateTimeField, null | null = never fetched, distinct from "fetched, none found" |

Constraints: partial-unique `isin` (when non-empty), partial-unique `amfi_code` (when non-empty) — symbol-only securities (crypto/FD) are deduped by application logic instead, since they'd share an empty ISIN.

### `NAVHistory` — one row per (security, date) price point
| Field | Type | Notes |
|---|---|---|
| `security` | FK → `Security`, `CASCADE` | |
| `date` | DateField | |
| `nav` | Decimal(20,6) | |
| `source` | CharField(32) | blank-default |

Unique: `(security, date)` — doubles as the index for as-of-date bisect lookups.

### `CorporateActionReference` — cached NSE/BSE corporate-action events
| Field | Type | Notes |
|---|---|---|
| `isin` | CharField(12), indexed | blank-default |
| `security` | FK → `Security`, null, `SET_NULL` | |
| `symbol`, `series`, `exchange` | CharField | |
| `ex_date` | DateField | |
| `record_date` | DateField, null | |
| `subject` | TextField | raw event text |
| `parsed_type` | CharField(32) | |
| `unit_multiplier`, `amount` | Decimal(20,6), null | |
| `parsed` | JSONField | |
| `needs_review` | BooleanField | |
| `source` | CharField(8) | |

Unique: `(isin, ex_date, subject, exchange)` when ISIN known, else `(symbol, ex_date, subject, exchange)` — two partial-unique constraints covering the ISIN-known/unknown split.

### `FXRate` — daily FX rate, deferred multi-currency valuation (v2, unused in v1 per the docstring)
`base_currency`, `quote_currency` (default `"INR"`), `date`, `rate` Decimal(18,6), `source`. Unique: `(base_currency, quote_currency, date)`.

---

## Investor-scoped ledger (every row FKs to `Investor` — the multi-tenant boundary)

### `Family` — groups investors for combined views
| Field | Type | Notes |
|---|---|---|
| `owned_by` | FK → `auth.User`, `CASCADE` | the advisor; v1 is effectively single-advisor but set at creation for a future multi-advisor backfill-free path |
| `name` | CharField(255) | |
| `archived_at` | DateTimeField, null | |

Unique: `(owned_by, name)` — two advisors can each have a "Sharma Family."

### `Investor` — a person whose investments are tracked (mirrors core `Investor`)
| Field | Type | Notes |
|---|---|---|
| `owned_by` | FK → `auth.User`, `CASCADE` | |
| `name` | CharField(255) | |
| `email` | EmailField | blank-default |
| `is_huf` | BooleanField | Hindu Undivided Family tax entity |
| `relation` | CharField(20) | |
| `family` | FK → `Family`, null, `SET_NULL` | |
| `pan_encrypted` | BinaryField, null | Fernet ciphertext |
| `pan_hash` | CharField(64), indexed | SHA-256, enables equality lookup without decrypting |
| `valuation_status` | CharField(10), choices (`pending`/`computing`/`ready`/`error`) | default `ready` |
| `valuation_recompute_from` | DateField, null | |
| `valuation_computed_through` | DateField, null | |
| `valuation_attempts` | PositiveSmallIntegerField | |
| `valuation_next_attempt_at` | DateTimeField, null | |
| `valuation_error` | TextField | |

Unique: `(owned_by, pan_hash)`, partial (only when `pan_hash` non-empty — many investors legitimately have no PAN). **Notable pattern: the row itself is a durable work-list** — `valuation_status`/`valuation_next_attempt_at` are what the background scheduler polls, not a separate job-queue table (file 01 §4's "the durable work-list is the Investor rows themselves").

### `Folio` — an MF folio or demat account belonging to an investor
`investor` FK CASCADE, `folio_type` (choices: `mf`/`demat`, from core `FolioType`), `number` CharField(64), `broker`, `amc_code`, `pan_kyc` BooleanField. Unique: `(investor, number, amc_code)`.

### `Transaction` — a single ledger event, input to FIFO/XIRR (mirrors core `Transaction`)
| Field | Type | Notes |
|---|---|---|
| `investor` | FK, `CASCADE` | |
| `security` | FK → `Security`, `PROTECT` | can't delete a Security with transactions against it |
| `folio` | FK → `Folio`, null, `SET_NULL` | |
| `date` | DateField | |
| `transaction_type` | CharField(16), choices | `buy`/`sell`/`dividend`/`bonus`/`split`/`merger`/`transfer_in`/`transfer_out` (core `TransactionType`) — **direction is carried by this field, never by sign**; `units`/`nav_or_price`/`fees` are always non-negative |
| `units` | Decimal(24,8) | |
| `nav_or_price` | Decimal(20,6) | |
| `amount` | Decimal(20,2), null | |
| `currency` | CharField(3) | default `"INR"` |
| `fx_rate_to_inr` | Decimal(18,6) | default `1` |
| `fees` | Decimal(20,2) | sell-side STT, not in cost basis |
| `stamp_duty` | Decimal(20,2) | transfer expense, not in cost basis |
| `brokerage` | Decimal(20,2) | buy-side, **is** folded into FIFO cost basis (Section 48) |
| `cost_total` | Decimal(22,4), null | exact lot cost preserved through an indivisible corporate-action ratio, so a repeating decimal at the per-unit column's precision never leaks cost; null = ordinary row, FIFO computes `units × nav_or_price` |
| `source` | CharField(20), choices | `cas-pdf`/`manual`/`csv-import`/`corporate-action` (core `TransactionSource`) |
| `source_ref` | CharField(128) | |
| `narration` | TextField | verbatim source statement text, audit-only, never in dedup/computation |
| `dedup_key` | CharField(64), indexed | SHA-256 content hash, blank for manual/corporate-action rows (no dedup) |
| `cost_basis_complete` | BooleanField | default True; False for a partial-history import row — excluded from every cost-basis/gains/XIRR/reconcile path via `TransactionQuerySet.cost_basis()` |

Unique: `(investor, dedup_key)`, partial (non-empty). Index: `(investor, security, date)`.

### `Holding` — point-in-time observed position (mirrors core `Holding`)
`investor` CASCADE, `security` PROTECT, `folio` null/SET_NULL, `as_of_date`, `units` Decimal(24,8), `value_observed`/`avg_cost_observed` Decimal, null, `source` choices (`ecas`/`manual`/`cas-pdf`/`ledger` — the last, `ledger`, is derived in-memory only, never persisted, per the core enum's own comment), `source_ref`.

Two unique constraints split by whether `folio` is set (SQL treats NULL as distinct per-row, so a single constraint including a nullable FK wouldn't dedupe folio-less holdings): `(investor, security, folio, as_of_date, source)` plus a partial `(investor, security, as_of_date, source)` WHERE `folio IS NULL`.

### `PartialBlock` — tracks a partial-history import scheme block, for order-independent ledger construction
`investor` CASCADE, `security` CASCADE, `folio` null/CASCADE, `opening_units`/`closing_units` Decimal(24,8) (closing nullable), `statement_from` DateField null. Unique: `(investor, security, folio)` — a later partial import of the same scheme overwrites (latest close wins). **Deleted once the block resolves** (chains onto the ledger) — this table only ever holds *unresolved* gaps, not history.

### `InvestorValue` — one day's net-worth point (the persisted day-wise series)
`investor` CASCADE, `date`, `invested_inr`/`value_inr` Decimal(20,2) default 0, `is_provisional` BooleanField (marks the one point seeded synchronously at import time, before the real NAV-driven series supersedes it). Unique: `(investor, date)`. Index: `(investor, date)`.

### `AppliedCorporateAction` — event log replayed over an immutable as-traded ledger
Key design point (own docstring): corporate actions are **never applied by mutating trade rows** — recorded as one event here, replayed in ex-date order by `compute_ledger` to derive an adjusted view. Raw `Transaction` rows always match the original contract note; re-import stays idempotent.

`investor` CASCADE, `folio` null/SET_NULL, `security` PROTECT (the affected instrument — for a merger, the security merging away), `counterparty_security` FK null/PROTECT, `related_name="+"` (the acquirer, no reverse accessor), `kind` CharField(32) (a `CorpActionType` value), `ex_date`, then per-kind optional params: `unit_multiplier`, `bonus_ratio_a`/`bonus_ratio_b` (Integer), `merger_ratio`, `units`, `price`, `dividend_per_share`, `source_ref` (idempotency key: `ca-ref:{id}` for a cached feed event, `manual:…` for hand-authored), `params` JSONField (forward-compat for richer events, e.g. a demerger's children + cost fractions).

Unique: `(investor, folio, security, source_ref)`, partial (non-empty) — an event applies at most once. Index: `(investor, security, ex_date)`.

---

## Import pipeline

### `ImportJob` — synchronous import status row (no task queue in v1)
`investor` CASCADE, `kind` choices (`cas`/`csv`/`manual`), `status` choices (`pending`/`running`/`success`/`completed_with_warnings`/`needs_confirmation`/`failed`), `filename`, `source_ref` (file hash), `result` JSONField (**untyped at the API layer** — file 01 §11 weakness #3), `error` TextField, `started_at`/`finished_at`. Index: `(investor, status)`.

### `ImportQuarantine` — a single row/block that couldn't be persisted, set aside for review
`investor` CASCADE, `import_job` FK CASCADE (deleted with its job), `kind`, `security_name`/`isin`/`folio_number` (identity for display + auto-resolve matching on a later clean re-import), `reason` TextField (PII-free exception message), `raw` JSONField (snapshot for audit, never replayed), `resolved` BooleanField, `resolved_at`. Index: `(investor, resolved)`.

---

## Integrity / reconciliation

### `SecurityIntegrityStatus` — per-(investor, security, folio) reconciliation cache
`investor` CASCADE, `security` CASCADE, `folio` CASCADE (reconciliation is **per-folio** — completeness and lots are folio-scoped, so the same scheme can be full-history in one folio and snapshot-only in another), `status` choices (`full_history`/`snapshot_only`/`reconciled`/`mismatch`/`user_acknowledged` — core `IntegrityStatus`), `tax_safe` BooleanField, `units_from_transactions`/`units_from_holdings` Decimal(24,8) null, `issues` JSONField (list of issue dicts, e.g. unit-mismatch deltas), `ledger_through`/`snapshot_as_of` DateField null (temporal context for *when* each side was last observed), `last_reconciled_at`.

Unique: `(investor, security, folio)`. Index: `(investor, tax_safe)` — speeds "tax-safe securities for investor X."

---

## Licensing (scaffolded, unwired — file 01 §11 weakness #5)

### `License`
`token` TextField unique (raw signed ed25519 blob), `tier` choices (`free`/`tax_pack`/`pm_pro`), `features` JSONField (list of flag strings), `licensee`, `email`, `issued_at`/`expires_at`, `payload` JSONField (full verified parsed payload, forward-compat), `is_active` BooleanField.

---

## Relationship summary

```
auth.User (Django built-in)
   │ owned_by
   ├── Family ──────────┐
   │                     │ family (nullable)
   └── Investor ─────────┘
          │
          ├── Folio
          ├── Transaction ───→ Security ───→ AMC
          │        │                │
          │        │                ├── NAVHistory
          │        │                └── CorporateActionReference
          ├── Holding ──────→ Security, Folio
          ├── PartialBlock ─→ Security, Folio
          ├── InvestorValue
          ├── AppliedCorporateAction ─→ Security (+ counterparty Security)
          ├── ImportJob ──→ ImportQuarantine
          └── SecurityIntegrityStatus ─→ Security, Folio

License — standalone, advisor-level, no FK to Investor
```

## Patterns worth carrying into Ledger's `core/portfolio` design

1. **The owning row doubles as a durable work-list** (`Investor.valuation_status`/`valuation_next_attempt_at`) instead of a separate job-queue table — one row to query for "what needs recomputing," no separate queue to keep in sync.
2. **Corporate actions are an append-only event log, replayed over immutable trade rows** — never a mutation of historical `Transaction` rows. Directly relevant if Ledger's Portfolio ever needs splits/bonuses/mergers: keep the as-traded ledger untouched, derive the adjusted view.
3. **Reconciliation status is cached per-folio, not per-security** — completeness is a property of (security, account-that-holds-it), not the security alone.
4. **Partial-history import gaps are a first-class, self-deleting row** (`PartialBlock`), not a flag buried in the transaction — it exists only while unresolved and disappears once the ledger catches up to it.
5. **PAN (or any similarly sensitive identifier) is stored encrypted + a separate lookup hash** — equality/dedup without ever decrypting for a lookup query.
6. **Choices are sourced from the core enums as a single source of truth** (`_choices(TransactionType)` etc.) — the Django `choices=` list is generated, never hand-duplicated against the core `StrEnum`.
