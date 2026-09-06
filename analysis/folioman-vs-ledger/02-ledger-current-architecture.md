# Ledger Current Architecture — Source-Verified

Same standard as file 01: claims are grep/read-verified against this repository's actual source, not restated from `docs/06-architecture.md` alone (that doc is a design intent from MVP planning and is stale in places — e.g. it still says "MVP supports INR only," superseded by the 2026-09-03 Currency Catalogue delta).

## Stack and process model

Next.js (App Router) + React + TypeScript, one Node process, SQLite via Drizzle (`better-sqlite3`, `src/server/db/client.ts`). No separate REST/HTTP API for reads. No workspace/monorepo split — one `package.json`; `pnpm-workspace.yaml` exists only to configure native-build allowlisting (`allowBuilds: { better-sqlite3: true, ... }`), not multi-package boundaries.

## The layers, as they actually exist

```
src/
├── domain/            14 files — pure business rules (money, posting, transaction, quantity, ...)
├── server/
│   ├── db/            schema.ts (Drizzle), client.ts (the one connection singleton), migrations/
│   ├── repositories/   17 files — thin Drizzle queries, one per aggregate
│   ├── use-cases/      19 files — orchestration: validate via domain/, call repositories/
│   └── actions/        30 files — "use server" Server Actions: auth gate + Zod parse + call use-case
├── components/         100 files — React Client/Server Components
└── app/                33 files — Next.js App Router routes (Server Components)
```

### `domain/` — the one layer with real, enforced isolation

`grep -rhn "^import" src/domain/*.ts` shows zero external imports outside test files (`vitest` only). This is enforced, not just true today by accident — `eslint.config.mjs`:
```js
{
  files: ["src/domain/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        { name: "react", message: "src/domain must stay framework-free (docs/06-architecture.md)." },
        { name: "drizzle-orm", message: "...Persistence belongs in src/server." },
        { name: "better-sqlite3", message: "src/domain must not depend on the DB driver." },
      ],
      patterns: [
        { group: ["next/*"], message: "src/domain must stay framework-free." },
        { group: ["@/server/*", "@/app/*", ...], message: "src/domain must not import from src/server or src/app." },
      ],
    }],
  },
}
```
This is a real CI-enforceable guarantee — the closest thing Ledger has to Folioman's package-boundary enforcement of `core/`, achieved with one lint rule instead of a separate installable package.

**`domain/` is imported directly by 35 Client Component files** (`grep -rl 'from "@/domain"' src/components src/app | wc -l` → 35) — e.g. `account-form.tsx`, `transaction-form.tsx`, `recurring-calendar.tsx`. This is a structural difference from Folioman worth naming precisely: Ledger's "core" is not just framework-free, it is **directly shared with the browser bundle**, because TypeScript compiles to the same language on both sides. The same validation/formatting logic (e.g. `toMinorUnits`/`fromMinorUnits`, quantity scaling) runs client-side for instant UX feedback and server-side for authoritative enforcement (`server/use-cases`) — one implementation, two call sites, not duplicated logic. Folioman cannot do this at all (Python core, Vue frontend, different languages) — its frontend's type safety instead comes from `openapi-typescript` codegen against `core`'s Python types serialized through Django Ninja schemas.

### `server/repositories` → `server/use-cases` → `server/actions` — convention-only, zero violations found, zero enforcement

Checked directly:
```
grep -rln 'from "@/components' src/server/use-cases          → no matches
grep -rln 'from "\.\./actions' src/server/use-cases           → no matches
grep -rln 'from "\.\./use-cases"' src/server/repositories      → no matches
```
The layering holds in practice today. But unlike `domain/`, **nothing in `eslint.config.mjs` enforces it** — no rule stops a future `server/repositories/*.ts` file from importing a use-case, or a use-case from importing an action. The only guard is AGENTS.md convention (rule #17: "Domain/application validation must not be replaced by UI validation") plus code review. This is the one clear place Folioman's actual package-boundary mechanism is structurally stronger than Ledger's current lint-rule-plus-convention approach — though the practical risk is bounded, since a violation here would be caught by any competent review, not silently shipped.

### How the browser actually reaches the server — no API layer, two distinct paths

**Reads:** Server Components import `use-cases`/`db` **directly**, in-process, at render time — verified by checking for the `"use client"` directive:
```
src/components/dashboard-panels/net-worth-panel.tsx   — NO "use client" — imports @/server/db/client + @/server/use-cases/accounts directly
src/app/(app)/transactions/page.tsx                    — NO "use client" — same pattern
```
There is no HTTP hop, no serialization boundary, no OpenAPI spec, for a single read in this application. This is the single largest structural difference from Folioman, which always crosses a real HTTP+JSON boundary from Vue to Django Ninja even for a GET.

**Writes:** Client Components call **Server Actions** (`"use server"` functions in `src/server/actions/*.ts`), a Next.js-specific RPC mechanism — the client imports and calls what looks like a normal async function, and Next.js's bundler splits it into a real network call under the hood. Example chain, `transactions/page.tsx` → `TransactionFilterDrawer` (Client Component) → `createInstrumentAction`/`searchInstrumentsAction` (`"use server"`, `src/server/actions/instruments.ts`) → `*.core.ts` (Zod parse) → `use-cases/instruments.ts` → `repositories/instruments.ts`.

**Type sharing across this boundary is free.** Client Components import server types with `import type` (erased at compile time, zero runtime coupling, verified for `account-table.tsx`, `dashboard-grid.tsx`, `transaction-filter-drawer.tsx`, `panel-config-dialog.tsx`, `recurring-rules-table.tsx` — all confirmed `import type`, not value imports). No codegen step, unlike Folioman's `openapi-typescript` pipeline.

### The critical gap versus Folioman: no host-agnostic "app" boundary

Folioman's `app/` is coupled to Django, but Django itself is transport-agnostic — the same WSGI callable runs under gunicorn or a loopback dev server with zero code change (`desktop/server.py` proves this directly). Ledger's `server/use-cases` layer has no equivalent. It is reached two structurally different ways today:

1. Directly, by Server Components, assuming they're executing inside a Next.js render pass (no request/response object, no explicit auth check unless the use-case itself calls `requireActiveProfile()`).
2. Via Server Actions, assuming Next.js's action-dispatch machinery (`"use server"` directive, its own serialization rules for arguments/return values).

Neither path is "just call this function from any Node process" the way Folioman's WSGI app is "just serve this from any WSGI host." If Ledger ever needs a Desktop delivery target, **this is the specific, narrow gap to close** — not a sign that `domain/`, `use-cases/`, or `repositories/` themselves are wrong; they're the layers Folioman's own experience says should exist, and Ledger already has them, cleanly separated in every check performed above.

## Evidence that the current layering already absorbs "Portfolio-shaped" work

This is not hypothetical — it happened in this repository, this session. The Instrument Catalogue delta (`docs/completed/2026-09-04-Instrument-Catalogue.md`) added: a new domain concept (`domain/instrument.ts`, `domain/quantity.ts`), posting-level quantity/price with a generalized balance-check invariant (`domain/transaction.ts`, `domain/posting.ts`), an external-data ingestion use-case (`server/use-cases/catalogue.ts`, primary/fallback HTTP fetch against IndianAPI), a new repository (`server/repositories/instruments.ts`), new actions, and a new UI picker — all without changing the layer boundaries, without an ESLint exception, and without any test regression across 547 existing tests. This is direct, current evidence that "Portfolio" (investment/valuation domain growth) is not, by itself, a forcing function for restructuring Ledger's existing layers. The forcing function (if any) is specifically the *Desktop delivery target*, which is a separate concern (see file 03).

## What Ledger does not have that this comparison surfaces as absent, not necessarily wrong

- No workspace/package-level boundary anywhere except the one ESLint rule on `domain/`.
- No settings-module-style single point of "which mode am I running in" (Ledger has no desktop/server split to need one yet).
- No generated/typed HTTP contract (`openapi.json`-equivalent) — moot today since there's no separate frontend language, but would become relevant the moment any *non-TypeScript* client needed to talk to Ledger.
- No background-job/scheduler layer analogous to Folioman's APScheduler-driven valuation refresh — Ledger has no automatic transaction generation or scheduled recompute anywhere yet (Recurring Rules are explicitly "no automatic transaction generation," per `AGENTS.md` rule #27).
