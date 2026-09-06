# Migration Plan — Adopting the Core(Ledger+Portfolio)/App/Host Design

Companion to files 00-04. This is the redesign step those files deliberately deferred ("the next step will be a separate architecture redesign exercise" — that step is now this file, requested explicitly with a target diagram). Still a plan, not an implementation: no code changed by this file.

## Target, restated

```
core/ledger/        core/portfolio/       — WHAT: framework-free domain facts
app/                                       — HOW: persistence, orchestration, services, importers, tasks
server/  desktop/  android/  ios/          — WHERE: delivery hosts over the same App/Core
```

## The one place the target needs to be corrected before it can be built, not just restructured into

**"Core contains two independent business domains" is not fully achievable as stated, given what's already shipped.** The Revised Investment Model delta (ADR-038, `docs/07-decisions.md`) made `postings.quantity`/`postings.price` fields on *every* posting, and generalized the Transaction balance check to a "reconciliation value" comparison that explicitly branches on `account.isInstrumentBacked` (`src/domain/transaction.ts`). That means: **a Portfolio transaction (buying a stock, a mutual fund) is not a separate kind of thing from a Ledger transaction — it is a Ledger transaction**, validated by the same balance-check code, on the same `postings` table, through the same `createTransaction`/`editTransaction` use-cases. There is no second transaction-recording mechanism for Portfolio to own independently.

This is a real, current fact about the domain, not an implementation accident to fix — a stock purchase must debit an Instrument-backed asset account and credit a funding account, and that pairing must balance exactly like any other transfer. Folioman never faced this tension because it has no double-entry ledger at all (file 01) — its `core/` never had two domains competing for one transaction-recording engine to arbitrate.

**Resolution, consistent with the diagram's spirit:** `core/ledger` owns the Account/Transaction/Posting engine, including the `isInstrumentBacked` branch of the balance check — that branch is unavoidably ledger-and-portfolio-aware at the validation-invariant level, the same way Folioman's `Transaction.ledger_id` field is core's one acknowledged nod to a caller it can't fully ignore (file 01 §11). `core/portfolio` depends on `core/ledger` for the transaction/posting shape it posts through (one-directional: portfolio → ledger, never the reverse); it does **not** get its own independent transaction/balance concept. "Independent domains" becomes "independently organized, testable, and understandable domains with one declared dependency direction" — not zero coupling. This should be written into whatever ADR ratifies this migration, so a future contributor doesn't attempt to fully decouple something that structurally can't be, per the invariant this codebase already committed to.

## `core/` — splitting `src/domain/` (14 files, currently flat) into `core/ledger/` and `core/portfolio/`

| Current file | Target | Notes |
|---|---|---|
| `account.ts` | `core/ledger/accounts/` | classification, instrument-type enums, `INSTRUMENT_BACKED_TYPES` re-exported from here today — the type list itself is shared vocabulary both domains reference |
| `accountIdentifier.ts` | `core/ledger/accounts/` | import-resolution identity, ledger-only concern |
| `balance.ts` | `core/ledger/accounts/` | `accountBalance`, debit-normal logic |
| `transaction.ts` | `core/ledger/transactions/` | the balance-check engine — stays here per the correction above; portfolio imports from it, doesn't fork it |
| `posting.ts` | `core/ledger/transactions/` | posting invariants, including quantity/price validation |
| `budget.ts` | `core/ledger/budgets/` | |
| `recurring.ts` | `core/ledger/transactions/` (or its own `recurring/`) | a Recurring Rule is a transaction template (AGENTS.md rule #27) — lives beside transactions |
| `dashboard.ts` | **not core** — see cross-cutting note below | |
| `import.ts` | `core/ledger/statements/` | import-status vocabulary; adapter-specific parsing itself lives in `app/importers/`, not core |
| `instrument.ts` | `core/portfolio/instruments/` | `INSTRUMENT_BACKED_TYPES`'s portfolio-relevant subset, `isInstrumentBackedType` |
| `quantity.ts` | `core/portfolio/instruments/` | fixed-scale quantity type |
| `currency.ts` | `core/shared/` (new) | used by both domains — an Instrument-backed posting still resolves through an Account's Currency |
| `money.ts` | `core/shared/` (new) | same reason — FIFO/valuation math (future Portfolio work) will need the same integer-minor-units discipline this already establishes (ADR-022) |
| `index.ts` | one per package: `core/ledger/index.ts`, `core/portfolio/index.ts`, `core/shared/index.ts` | |

**`core/shared/` is a needed addition the target diagram doesn't show but requires.** Money and Currency are not ledger-specific or portfolio-specific; they're primitives both domains sit on. Without naming this bucket explicitly, the first person to add Portfolio's valuation math will face an unlabeled choice between "duplicate Money in portfolio/" and "make portfolio depend on ledger for something that isn't really a ledger concept" — name it now.

**Not a move — a deferral.** `budgets/`, `statements/`, `insights/` under `core/portfolio/` in the target tree are empty placeholders today; nothing in the current codebase corresponds to them yet (Portfolio has no budgets, no statements beyond CAS-shaped import, no insights). Create them when the first real content exists, not as empty scaffolding now (YAGNI) — the folder structure itself is free to add the moment there's a file to put in it.

**`dashboard.ts` is cross-cutting, not core.** ADR-037 already settled this: "The Homepage... owns no financial summary model of its own, it only renders the Dashboard's Panels," and a Panel can show either a Ledger fact (Balances, Recent Transactions) or a future Portfolio fact (Portfolio Value) — the registry that describes *which panels exist* is UI composition metadata, not a domain fact either `core/ledger` or `core/portfolio` should own. Leave it at the `app/` layer (or a thin `server/`-side composition module) — see the `app/` table below.

## `app/` — from `src/server/{use-cases,repositories,actions}/` + `src/server/import-adapters/`

The target's own vocabulary (`persistence/`, `repositories/`, `services/`, `importers/`, `tasks/`) maps directly onto what already exists, with one renaming and one real structural change:

| Current | Target | Change type |
|---|---|---|
| `src/server/db/` (schema.ts, client.ts, migrations/) | `app/persistence/` | move, no logic change |
| `src/server/repositories/*` (17 files) | `app/repositories/*` | move, no logic change |
| `src/server/use-cases/*` (19 files) | `app/services/*` | **rename** (matches target vocabulary — "use-cases" and "services" are the same layer under different names) |
| `src/server/import-adapters/*` (8 files) | `app/importers/*` | move, no logic change — this is already the strongest-precedent piece of the whole plan: `institution.product.format`-keyed, priority-ordered, generic-CSV fallback last (AGENTS.md rule #26) is structurally the same registry pattern as Folioman's `register_processor` (file 01 §9), just already built |
| *(nothing today)* | `app/tasks/` | **new** — Ledger has no scheduler/background-job layer at all (file 02's own finding). Do not scaffold this empty; add it when the first real scheduled job exists (e.g. a future NAV refresh for Portfolio, mirroring Folioman's APScheduler jobs, file 01 §4) |
| `src/server/actions/*` (30 files, `"use server"`) | **stays with the host, not `app/`** | see below — this is the one non-mechanical move |

**Why `actions/` doesn't move into `app/`.** A Server Action is a Next.js-specific RPC mechanism (`"use server"` directive, Next's own argument/return serialization) — it is delivery glue, exactly as host-specific as Folioman's `api/` Ninja routers, which stay in `app/` in Folioman's tree only because Django Ninja itself is transport-agnostic (the same WSGI app runs under gunicorn or a loopback server, file 01 §2). Next.js Server Actions have no such portability: they only exist inside a Next.js request. If `app/` is going to be genuinely shared by `server/` and `desktop/` the way the target diagram requires, **`app/services/*` must have zero Next.js coupling** — no `"use server"`, no assumption of running inside a Server Component render — so any host (Next.js today, a future non-Next.js desktop shell, eventually a mobile-facing HTTP layer) can call the same functions. `server/`'s own `actions/` then becomes: auth gate (`requireActiveProfile()`) + Zod parse + one call into `app/services/*` — unchanged in effect, moved in location, and now honestly labeled as host glue rather than shared application code.

**The other required change in this move: Server Components must stop reading `db`/repositories directly.** File 02 found several (`net-worth-panel.tsx`, `page.tsx` route files) importing `@/server/db/client` and calling `use-cases` in-process during render — correct and idiomatic for Next.js today, but it means there are currently *two* entry paths into the same business logic (direct Server Component calls, and Server Actions), where Folioman has exactly one (every request, read or write, goes through a Ninja view calling into `app/`). Under the target design, both paths should call `app/services/*` — Server Components still call it in-process (Next.js doesn't need Folioman's HTTP round trip for this, and shouldn't adopt one, per file 04's performance finding), but the call always goes through the same named service function, not a direct repository/db reach-through. This is what makes `app/` an honest single seam a Desktop host could also call, rather than an incidental side effect of Next.js's file-based routing.

## `server/` — the Next.js host

Becomes: `src/app/` (routes), `src/components/*`, and the relocated `actions/*` (now thin host glue). No behavior change; this is where the physical `src/` tree that exists today mostly ends up, minus what moved to `app/`/`core/`.

## `desktop/` — new host, per the feasibility answer already given

Wraps `server/`'s own build (`output: "standalone"` in `next.config.ts`, currently unset) via a Tauri shell + sidecar Node process — sidesteps `better-sqlite3`'s native-module ABI problem by running a real Node binary, not Electron's embedded one. `LEDGER_DATA_DIR` already exists as exactly the seam needed for a per-OS data directory. A first-run migration step is needed (mirroring Folioman's `bootstrap.py::_migrate_if_behind()`), since eager in-process migration is deliberately avoided elsewhere in this codebase for a documented reason (`client.ts`'s own comment on the Turbopack race). None of this requires `app/`/`core/` to look any different from what `server/` already needs — Desktop reuses `server/`'s Next.js build wholesale rather than re-implementing a second UI/host layer, which is the cheapest reading of "Desktop is a delivery host over the same App/Core" available here.

## Mobile — superseded: PWA, not native `android/`/`ios/` hosts

**This section originally assumed native iOS/Android apps and concluded mobile would require a new HTTP API surface. Superseded — see file 06.** The user has since specified mobile means a PWA (Progressive Web App) wrapping the existing Next.js web app, not a native client. Under that decision, mobile needs **no new API layer at all** — it *is* `server/`, installed to a home screen. File 06 validates this concept in full; the short version: it's a `server/`-only addition (web manifest + service worker + install/offline-shell UX), zero `core/`/`app/` changes, and the UI is already mobile-responsive today (`BottomNav` takes over from the sidebar below `md`, per `sidebar-nav.tsx`'s own comment referencing a documented §4.2 design decision). No `android/`/`ios/` top-level folders are needed under this plan.

## Sequencing (smallest safe steps, each independently shippable and test-green)

1. **`core/shared/` carve-out + `core/ledger/` / `core/portfolio/` split of `src/domain/`.** Pure move/rename with import-path updates; the ESLint domain-boundary rule (`eslint.config.mjs`) extends to both new paths unchanged in spirit. Zero behavior change — the existing 547+ domain/use-case tests are the regression gate.
2. **Rename `use-cases/` → `app/services/`, move `repositories/`, `db/`, `import-adapters/` under `app/`.** Mechanical; same regression gate.
3. **Route Server Components through `app/services/*` instead of `db`/repositories directly**, and move `actions/*` to be thin host glue calling the same services. This is the one behavior-preserving-but-structurally-real change — it's what actually closes the "no host-agnostic app boundary" gap from file 02/03, and is worth its own PR precisely so it's reviewed as the boundary-hardening step it is, not folded into a mechanical rename.
4. **Desktop packaging** (`output: "standalone"`, Tauri sidecar shell, migration-on-first-run script) — additive, touches no `core/`/`app/` code.
5. **`app/tasks/` and any Portfolio-side `core/portfolio` content** — built when the first real feature needs them (a NAV refresh job, CAS import, valuation), not scaffolded ahead of need.
6. **PWA (mobile)** — web manifest + service worker on `server/`; see file 06. No dependency on steps 1-5; can happen in any order, including before them.

Steps 1-2 are safe to do at any time and de-risk everything after. Step 3 is the one that matters architecturally and should not be skipped or merged silently into 1-2. Steps 4-6 are additive and can happen independently, in any order, whenever each is actually needed.

**This file's `core/ledger`/`core/portfolio` split above (and its "portfolio depends on ledger's transaction engine" correction) describes the *already-shipped* state as of ADR-038. The user has since directed a different target: Ledger and Portfolio fully delinked, with Portfolio maintaining its own transaction/holding tables, never posting through `accounts`/`postings`. See file 06 for that decision, its direct conflict with ADR-038/the Instrument Catalogue delta, and the open question it raises about already-shipped code that this plan does not resolve unilaterally.**
