# Valuation, Duplicate-Detection, and Charts — Gap Analysis

**Scope note:** analysis only, prompted by a set of Folioman screenshots (dashboard net-worth chart, Mutual Funds page, a security detail page with NAV history + "Snapshot only"/"Data Integrity" indicators). No Ledger code changed by this file. Extends the reference already captured in `07-folioman-database-model.md` (which covers the DB shape) with the *computation and UI* side: how Folioman actually gets a NAV, computes XIRR, dedupes, and charts — and which pieces of that are worth pulling into Ledger's `core/portfolio` versus which are Folioman-specific complexity Ledger doesn't need. Read against `/home/amitkul/dev/apps/folioman` at commit `b098bd7`.

## 1. Why Ledger's screens currently show "—" everywhere

Confirmed by direct inspection this session: `services/casImport.ts` persists `InvestmentTransaction`/`Holding` rows on CAS import, but **no code path ever writes to `nav_history`, and nothing calls an external NAV source at all.** `getInstrumentValuation` (services/navHistory.ts) has real logic for turning a NAV into a value — it just always receives an empty table. Every "Latest NAV" / "Current Value" / "Total Return" the Portfolio pages show is honestly rendered as `—` or "Not available yet" because there is *nothing feeding them*, not because the display logic is wrong. This matches what the screenshots show is possible once a real feed exists.

## 2. Valuation: Folioman's pattern is small and directly portable

`core/src/folioman_core/valuation.py` (157 lines, framework-free — no Django import) is a pure dispatcher:

```
value_holdings(holdings, as_of, nav_provider, quote_provider, crypto_provider) -> PortfolioValuation
```

Each holding is priced by asset type via an **injected provider callable** (`Security, date -> Decimal | None`), never a hardcoded HTTP call inside the valuation logic itself — the same DI seam `services/catalogue.ts`/`casImport.ts`'s `CasParserRunner` already use in Ledger. When a price can't be found, the row comes back `stale: True` with a **human-readable `note`** ("no NAV provider" / "NAV unavailable" / "FD value_observed not set") instead of a bare `None`.

**Concrete gap:** Ledger's `getInstrumentValuation` returns `{ units, latestNav: undefined, value: undefined }` with no reason attached, and the UI just renders `—`. Adopting Folioman's `stale + note` shape (even with only one provider, MF NAV) would let the Security detail page say *why* — "no NAV recorded yet" vs. "matured/delisted" vs. "provider unreachable" are different situations a user should be able to tell apart, and this costs nothing extra to compute since the reason is already known at the point `—` gets decided.

**XIRR** (`core/src/folioman_core/xirr.py`, 129 lines): Newton-Raphson with a bisection fallback, `Decimal` in / `float` solve / `Decimal`-safe cash-flow inputs. Zero framework dependency, well-isolated (`compute_xirr(cashflows) -> float | None`, `cashflows_from_transactions(...)` to build inputs from a transaction list + terminal value). This is the single missing piece behind every "Return / XIRR: Not available yet" card in Ledger today — there is currently no XIRR implementation anywhere in `core/portfolio`. It's a pure-math module with no I/O; a direct TypeScript port is low-risk and independently unit-testable the same way `xirr.py`'s own test suite presumably works it (root-finding edge cases: <2 flows, same-sign flows, non-convergent rates).

## 3. NAV source: the free AMFI bulk file, not a per-scheme API

`core/src/folioman_core/price_feeds/amfi_bulk.py`: AMFI (the mutual-fund industry regulator body) publishes **the entire market's current NAV in one `;`-delimited text file** (`https://portal.amfiindia.com/spages/NAVAll.txt`), refreshed once a business day, keyed by AMFI scheme code and ISIN. One GET replaces a per-scheme call for every holding across every profile. A companion endpoint (`DownloadNAVHistoryReport_Po.aspx`) returns a date-range history report for backfill.

This is a strong fit for Ledger specifically because of **Import Privacy (AGENTS.md rule #23)**: the bulk file requires no per-scheme query parameter at all — Ledger would download the *whole file* and look up its own holdings' ISINs locally, meaning **zero information about which schemes a profile holds is ever sent externally**, which is stronger than even the "minimum instrument/query information" rule #23 already permits for pricing providers. No API key, no per-request cost, no rate-limit design needed for a once-a-day fetch. Folioman's own retry logic (`_MAX_RETRIES = 2`, transient-status backoff) is a handful of lines, easily ported.

**What not to copy:** Folioman also has `nse_history.py`, `mfapi.py`, `captnemo.py`, `yfinance_feed.py` — four more providers for equities, crypto, and an alternate MF source. Ledger's Portfolio currently only has Mutual Fund holdings wired up (Stocks page is explicitly snapshot-only, no price feed at all per the existing "don't force symmetry" decision). **Start with AMFI bulk only** — a stock-price feed is a separate, later decision, not bundled into this one.

## 4. Duplicate-detection: two concrete, low-risk fixes to the existing dedup key

Ledger's `dedupKey` (`services/casImport.ts`): `sha256(profileId | isin | folioNumber | date | type | units | amount)`. Folioman's equivalent (`app/src/folioman_app/tasks/import_cas.py::_dedup_key`): `sha256(identity | folioNumber | date | type | units | nav | amount | balance)` where `identity = amfi_code or isin or symbol`.

Two differences, both real gaps, both cheap to close in the existing function:

1. **Identity fallback.** Folioman's `_scheme_has_identifier` accepts *either* ISIN *or* AMFI code — a scheme with no ISIN but a valid AMFI code still gets dedup'd and tracked. Ledger's `persistParsedCas` currently requires `scheme.isin` and **drops the entire scheme's transactions** if it's missing (`if (!scheme.isin) { transactionsSkipped += scheme.transactions.length; continue; }`) — even though `CasParserScheme.amfi` is already parsed and sitting unused (`runCasParser.ts`'s own type has had this field the whole time). Falling back to `scheme.amfi` when `isin` is absent would recover data Ledger is currently silently discarding.
2. **Balance in the hash.** Folioman explicitly includes the transaction's running `balance` in the dedup key, with a comment calling out exactly why: two genuinely distinct same-day, same-amount transactions (e.g. two SWP redemptions on the same date for the same amount) would otherwise hash identically. Ledger's `CasParserTransaction.balance` is already parsed and, again, unused. **Confirmed, not hypothetical:** `createInvestmentTransaction` (`services/investmentTransactions.ts`) checks `findInvestmentTransactionByDedupKey` first and, if found, **returns the existing row silently — no error, no second insert** ("already imported, do nothing" is the documented intent for a genuine re-import). A same-day/same-amount collision from the missing `balance` component would hit this exact path: the second real transaction would be silently discarded as if it were a duplicate of the first, with no warning anywhere. Fixed by adding `balance` to the hash input, same as Folioman.

Also worth taking: Folioman's `_canon_decimal` — canonicalizes a decimal to a fixed-point string (trims trailing zeros) *before* hashing, so `"8211.172"` and `"8211.1720"` from two different statement exports of the same event hash identically. Ledger's current key interpolates raw JS numbers directly, which mostly self-normalizes for floats (`String(8211.1720) === String(8211.172)` in JS) — lower risk than in Folioman's Decimal-string world, but worth confirming rather than assuming, since NAV/amount values from `casparser`'s JSON output aren't guaranteed to always arrive as JS numbers rather than numeric strings.

## 5. The "Snapshot only" / "Data Integrity" system in the screenshots

This is the biggest single feature gap, and the most expensive to adopt — flagging it, not recommending immediate implementation.

Folioman's `SecurityIntegrityStatus` (per-`(investor, security, folio)`, already documented in file 07 §"Integrity/reconciliation") tracks whether a scheme's transaction history is complete enough to trust for cost-basis/XIRR: `full_history` / `snapshot_only` / `reconciled` / `mismatch` / `user_acknowledged`, plus a `tax_safe` boolean and a JSON `issues` list (e.g. a unit-count mismatch between what the transactions imply and what the CAS's own closing-balance snapshot says). This is computed by `app/src/folioman_app/tasks/reconcile.py` (494 lines — not fully read this pass) and is what produces every one of these UI elements in the screenshots: the orange "Snapshot only" pill next to a holding name, the Dashboard's "1 / 23 tax-ready" bar, and the security page's "History before 10 Apr 2026 is missing... its value uses the statement's reported balance" banner.

**Why this matters for Ledger specifically:** a CAS statement only ever covers the period requested (e.g. "since 01-Apr-2026"), never necessarily a scheme's full since-inception history. Ledger's `persistParsedCas` already has the two raw ingredients this needs — it creates `InvestmentTransaction` rows from the statement's transaction lines *and* a `Holding` snapshot from the scheme's closing balance (`recordHolding`, when `scheme.close` is present) — but nothing currently flags "this scheme's transaction history doesn't go back to its first unit," so `getInstrumentValuation`'s reported "Invested" total is silently wrong (undercounted) for any holding whose CAS statement started mid-position, and there is no user-visible signal that this happened.

**What to actually take from this, at low cost, without building the full reconciliation engine:** a much smaller version gets most of the value — compare `sum(units from InvestmentTransaction rows)` against the `Holding` snapshot's observed `units` for the same security+folio; if they don't match, the holding's history is provably incomplete, and the UI can say so (a boolean-ish "Verified" vs "Snapshot only" badge, no `issues` JSON, no `mismatch`/`reconciled`/`user_acknowledged` state machine, no background job). Folioman's full 5-state model with a reconciliation task is the "if this becomes a real product surface" version — not a first cut.

## 6. Charts: the visual technique is portable to Ledger's existing Recharts, not a reason to add ECharts

Folioman's frontend uses `echarts` + `vue-echarts` (`frontend/package.json`). Ledger already has a chart primitive — `src/components/ui/chart.tsx`, a Recharts wrapper already used by `account-balance-trend-chart.tsx`/`account-cashflow-chart.tsx` for Ledger's own Insights tab. **Recommendation: extend that, don't introduce a second charting library.** Everything the screenshots show is expressible in Recharts:

- The net-worth/mutual-funds-value area chart (gradient fill under "Current value," dashed muted line for "Invested", `PortfolioValueChart.vue`) → Recharts `<AreaChart>` with a `<linearGradient>` `<defs>` (Recharts already supports this natively) plus a second `<Line strokeDasharray="4 4">` for the comparison series.
- The draggable zoom/overview slider under the chart (`buildDataZoom`, ECharts' `dataZoom` component) → Recharts' `<Brush>` component is the direct equivalent, not currently used anywhere in Ledger but a stock part of the library already installed.
- The NAV-history scatter with green/red buy/sell triangles → Recharts `<Scatter>` or custom `<ReferenceDot>` markers over a `<LineChart>`.
- The allocation donut → Recharts `<PieChart>` with `innerRadius` set (a donut is just a pie with a hole), which is how "TOTAL ₹57.62L" center-label donuts are typically built in Recharts too.

One real technique worth copying regardless of library: `useChartTokens.ts` resolves CSS custom properties to concrete color strings via `getComputedStyle`, because **canvas-based ECharts can't read CSS variables directly** and needs colors re-resolved on theme toggle. Ledger's SVG-based Recharts charts don't have this problem — `account-balance-trend-chart.tsx` already references `var(--chart-1)` directly in a `stroke` attribute, since SVG (unlike canvas) *does* understand CSS custom properties live. This is a point in favor of Recharts over ECharts for Ledger, not a gap: staying on Recharts means never needing Folioman's token-resolution workaround at all.

## 7. Priority, if/when this becomes real work (not decided by this file)

Roughly cheapest-and-safest to most-involved, for whoever scopes the actual implementation:

1. **Dedup key fixes** (§4) — pure logic change inside one existing function, two new inputs (`scheme.amfi` fallback, `txn.balance`), already-parsed fields, no schema change, immediately testable against the existing synthetic CAS fixture.
2. **AMFI bulk NAV feed** (§3) — one new provider module (`recordNav` already exists per earlier session notes — "nothing calls it yet" — this is what would finally call it), a scheduled or on-demand fetch, populates `nav_history`, unblocks every "—" in the Portfolio UI at once.
3. **XIRR** (§2) — a pure-math module port, no dependencies on §2/§3 landing first (can be written and tested standalone against a synthetic cashflow list), but only becomes *visible* in the UI once real NAV data (§3) gives it something to compute against.
4. **Valuation `stale`/`note` shape** (§2) — small refactor of `getInstrumentValuation`'s return shape once §3 exists, so a missing price says why.
5. **Snapshot-only / integrity signal** (§5) — the most valuable *visually* (it's the one thing in the screenshots Ledger has zero equivalent of today) but the most involved; the cut-down version described (a units-mismatch check, no full state machine) is the right scope for a first pass, not Folioman's full 5-state reconciliation engine.

None of this is scheduled or approved by this file — it's the diagnosis the next planning conversation would start from, same posture as file 00.
