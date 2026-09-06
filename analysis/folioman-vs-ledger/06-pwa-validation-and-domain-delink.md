# PWA Mobile Validation, and the Ledger/Portfolio Delink Decision

Two updates to file 05, both from explicit user direction rather than derived analysis: mobile is a PWA, not a native app; and Ledger/Portfolio are to be **fully** delinked going forward (separate tables, never posting through `accounts`/`postings`), superseding the "portfolio depends on ledger's transaction engine" correction file 05 made. This file validates the first and works through the consequences of the second — including a real conflict with already-shipped code that needs an explicit answer before anything is built.

---

## Part 1 — PWA as the mobile strategy: validated

**Verdict: sound, and considerably cheaper than the native-mobile path file 05 originally priced in.** A PWA is the existing `server/` web app plus an install/offline-shell layer — it needs no new API surface, because there's no separate mobile client language to bridge to. This directly retires file 05's biggest flagged risk ("mobile is an additional host" implicitly commits to building an HTTP API that doesn't exist).

### What's needed, concretely

1. **A web manifest.** Next.js App Router has a native file convention for this — confirmed against this Next version's own bundled docs (`node_modules/next/dist/docs/.../manifest.md`), not assumed from general Next.js knowledge given this repo's own warning that this version has breaking changes from training-data Next.js: an `app/manifest.ts` special file returning a `MetadataRoute.Manifest` object (`name`, `short_name`, `display: "standalone"`, `icons`, `theme_color`). No plugin required for this part.
2. **A service worker**, for install-ability + asset caching (not built into Next.js core — needs a small, well-trodden addition; `serwist` is the actively-maintained App-Router-compatible successor to the older `next-pwa`). Not currently present (`grep -n "pwa\|workbox\|serwist" package.json` → no matches) — a new, small dependency, additive only to `server/`.
3. **HTTPS**, a hard requirement for service-worker registration (`localhost` is exempt, a real phone accessing a self-hosted instance is not). This isn't a new burden — `docs/06-architecture.md` already lists Traefik/Tailscale as the planned "later" self-hosting path, and Tailscale specifically offers HTTPS via MagicDNS certs with no separate reverse-proxy setup — the PWA requirement and the existing self-hosting roadmap point at the same infrastructure.
4. **Mobile-responsive UI** — already true today, not something this adds. `src/components/sidebar-nav.tsx` hides the desktop sidebar below the `md` breakpoint specifically because `BottomNav` (`src/app/(app)/layout.tsx`) takes over on small screens — the comment references a documented design decision (§4.2), so this was already deliberate, not accidental.

### What a PWA does **not** give this app, and why that's fine

**No offline data entry.** This is the one place "PWA" as a word oversells what applies here. A service worker can cache the app shell (JS/CSS/static assets) so the UI *loads* offline, but Ledger's actual data — accounts, transactions, balances — lives in one self-hosted SQLite file behind a live Next.js server (`docs/06-architecture.md`: "SQLite is source of truth"). There is no local-first sync engine, and building one would be a large, separate feature (conflict resolution, a local write queue, eventual consistency with the single source of truth) — not implied by "make it a PWA" and not something this validation recommends starting. A PWA here buys **installability and a native-feeling shell** (home-screen icon, no browser chrome, `display: "standalone"`) for a still-fundamentally-online app — the same value proposition as, e.g., most banking-app PWAs, not an offline-first rework.

**No change to `core/`/`app/`.** This is purely additive to `server/` (a manifest file, a service worker, some icons). It has zero interaction with the Core/App/Host redesign in file 05, which is why it's listed last in that file's sequencing and explicitly independent of every other step.

---

## Part 2 — Ledger/Portfolio full delink: what it means, and the conflict it creates

### The new target, restated precisely

```
core/ledger/       Account, Transaction, Posting, Money, Currency, Budget, Recurring, Statement
core/portfolio/     Instrument, PortfolioAccount, Folio, InvestmentTransaction, Holding,
                    Quantity, NAV, Valuation, CAS
```
Portfolio gets its own transaction concept (`InvestmentTransaction`) and its own account concept (`PortfolioAccount`), persisted in **separate tables** from `accounts`/`transactions`/`postings`. A stock or mutual-fund purchase is never a Ledger Transaction. This is, precisely, Folioman's actual shape (investor → folio → transaction → holding, file 01) — not "inspired by," but the same domain structure, now explicitly adopted rather than referenced.

This resolves file 05's "independence" correction cleanly, going forward: with no shared transaction/posting table, `core/portfolio` genuinely does not need to depend on `core/ledger` for anything beyond `core/shared` primitives (Money, Currency, Quantity) — real independence, not the one-directional compromise file 05 proposed for the *previously* shipped shape.

### The conflict: this reverses work already shipped and ratified in `docs/07-decisions.md`

Two deltas already exist that assume the *opposite* design:

- **ADR-038 (Revised Investment Model, 2026-09-03)** put `quantity`/`price` directly on `postings` — every posting, not just Instrument-backed ones — and generalized the Transaction balance check to a "reconciliation value" comparison specifically so an Instrument purchase/sale is validated as a normal double-entry Transaction. Its own text states this was a deliberate design decision superseding the original 2026-08-21 doc's Account-level quantity idea, not a stopgap.
- **The Instrument Catalogue delta (ADR-039, 2026-09-04)** built real IndianAPI ingestion, search, and an Account-form picker for Instrument-backed accounts — all premised on Instrument-backed accounts being ordinary `accounts` rows with ordinary `postings`.

Under the new direction, both of these are not "extended," they're **walked back**: `postings.quantity`/`postings.price` (schema migrations `0010_fuzzy_exodus.sql`, and the domain/use-case validation logic built on top of them) would become dead columns/logic for any *new* portfolio work, since a real `InvestmentTransaction` table replaces them. The `instruments` table and its catalogue columns (`source`, `sourceId`, `nseCode`, `bseCode`, `isin` — migration `0011_white_katie_power.sql`) may still be reusable (a catalogue of instruments is still needed to reference from `PortfolioAccount`/`Folio`), but the *Account→Instrument* linkage (`accounts.instrumentId`) and the whole posting-level quantity/price mechanism built to support it stop being the path forward.

This is exactly the situation AGENTS.md rule #20 describes ("If a requirement conflicts with docs, stop and report the conflict before coding") — surfaced here rather than silently resolved, because this file is analysis, not implementation, and the resolution has real consequences for shipped code and any real data already created against it (e.g., any Instrument-backed account a real user has already created in their own `data/ledger.db`, per `AGENTS.md` rule #24's own privacy framing of that file as real, not fixture, data).

### Two ways to resolve it — a decision, not a default

**(a) Deprecate the ADR-038/ADR-039 mechanism outright.** New ADR supersedes both. `postings.quantity`/`postings.price` stop being written by new code (a follow-up migration can drop the columns once no code path sets them, or they're left inert if any historical data must be preserved as-is). `accounts.instrumentId`/`instrumentLabel` stop being offered in the Account form for new accounts. Any account already created as Instrument-backed under the old model needs an explicit migration story — most plausibly, one-time conversion into the new `PortfolioAccount`/`Folio`/`InvestmentTransaction` shape (mirroring however existing `postings` for that account get reinterpreted as investment transactions), since AGENTS.md rule #9 ("transactions are hard-deleted," implying no soft-archival pattern exists here to fall back on) means simply "leaving old data alone" isn't a neutral no-op — it leaves a real account permanently stuck in a model the rest of the app no longer understands.

**(b) Keep both mechanisms, permanently.** Old Instrument-backed accounts (quantity/price on postings) stay exactly as they are for accounts that already use them; **all new** Portfolio work goes into the fully-separate model. This avoids any data migration, but means the codebase carries two different ways to represent "I own units of something" indefinitely — a real, ongoing maintenance cost (two mental models, two code paths, two things a future contributor has to know about), and it directly contradicts "Portfolio transactions will never land in ledger accounts" as a categorical statement, since the already-existing ones already do and would keep doing so.

**This analysis recommends (a).** The whole point of the new direction is a clean, non-negotiable separation ("will never," not "will no longer, for new accounts") — option (b) keeps exactly the coupling the new direction exists to remove, just scoped to old data. Given how recently ADR-038/039 shipped (within this same working session, and per `data/ledger.db`'s own state, likely with little or no real Instrument-backed account data created against it yet in practice), the migration cost of (a) is probably small right now and only grows the longer the old mechanism stays live.

**Decided: (a) — deprecate and migrate. Implemented 2026-09-05 — see ADR-040 in `docs/07-decisions.md`.** `MUTUAL_FUND`/`STOCK`/`COMMODITY` are removed from Ledger's `INSTRUMENT_TYPES`; the `isInstrumentBacked` validation branch, the Account form's Instrument picker, and the transaction form's Units field are deleted outright (not flagged off). `postings.quantity`/`postings.price` and the Instrument Catalogue backend both survive — the former for Currency Conversion, the latter because it never depended on `accounts` in the first place, so it needed no "migration," just its one linkage point removed. What's still a real follow-up, not resolved here: any Account actually created as Instrument-backed under the old model (this session's own dev database, if it has one) still needs a one-time conversion into the eventual `PortfolioAccount` shape once that model exists — `accounts.instrumentId`/`instrumentLabel` columns are left inert in the schema for exactly that reason, not dropped now.

### Updated `core/portfolio` table sketch, under option (a)

Matching the domain names the user specified, each maps to its own table (schemas intentionally not designed here — this remains diagnosis/planning, not implementation, per the original task brief's own scope limit, now extended to this follow-up):

```
portfolio_accounts     — replaces the old accounts.instrumentId linkage entirely
folios                 — a specific holding-account-within-a-provider (Folioman's own concept, file 01 §3)
investment_transactions — buy/sell/dividend events; own balance rules (FIFO-oriented), not debit/credit
holdings               — point-in-time position snapshot, as Folioman's Holding models it
instruments            — reused from the existing catalogue (ADR-039), now referenced by portfolio_accounts/folios instead of accounts
nav / valuations       — new; no equivalent exists yet
cas_imports            — new; the CAS ingestion pipeline itself lives in app/importers, per file 05
```

No table here inherits from or writes to `accounts`/`transactions`/`postings`. `core/shared` (Money, Currency, Quantity) is the only thing both `core/ledger` and `core/portfolio` depend on.
